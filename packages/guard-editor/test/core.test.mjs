import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIONS, FORCED_MARKER, canonicalJson, parseJson, readJsonValue, readPolicy, validatePolicy, serializePolicy,
  parsePolicy, compilePolicy, previewCompiledPolicy, readSchema, readCapabilities, operatorsFor, validateLiteral,
} from '../dist/index.js';
import { context, freshContext, policy, disabledPolicy } from './fixtures/context.mjs';

const rejects = (value, ctx = context, pattern) => assert.throws(() => readPolicy(value, ctx), pattern);
const field = name => context.schema.models.find(model => model.name === 'User').fields.find(field => field.name === name);
const forceRule = (field, value) => ({ kind: 'forced', field, value: { kind: 'literal', value } });

for (const operation of OPERATIONS) {
  test(`${operation}: validated round trip and operation-specific compiler output`, () => {
    const value = policy(operation);
    const text = serializePolicy(value, context);
    assert.deepEqual(parsePolicy(text, context), value);
    assert.equal(serializePolicy(parsePolicy(text, context), context), text);
    const compiled = compilePolicy(value, context);
    assert.equal(compiled.operation, operation);
    assert.equal(compiled.enabled, true);
    assert.deepEqual(compiled.shape.select, { id: true });
    assert.equal(compiled.requirements.enforceProjection, true);
    assert.equal(Object.hasOwn(compiled.shape, 'take'), ['findMany', 'findManyPaginated'].includes(operation));
    assert.equal(Object.hasOwn(compiled.shape, 'where'), ['findUnique', 'update', 'delete'].includes(operation));
    assert.equal(Object.hasOwn(compiled.shape, 'data'), ['create', 'update'].includes(operation));
  });
  test(`${operation}: disabled policy never compiles an empty executable shape`, () => {
    const compiled = compilePolicy(disabledPolicy(operation), context);
    assert.deepEqual(compiled, { enabled: false, model: 'User', operation });
    assert.equal(Object.hasOwn(compiled, 'shape'), false);
  });
  test(`${operation}: an enabled empty projection is refused`, () => rejects({ ...policy(operation), select: [] }, context, /projection/));
}

test('canonical collections are sorted; literal arrays retain order and Unicode', () => {
  const value = policy('create');
  value.select.push({ kind: 'field', field: 'email' });
  value.data = [forceRule('tags', ['ไทย', 'русский', 'a', 'a']), forceRule('meta', { z: 1, a: { z: 'é', a: 2 } })];
  const reversed = { ...value, select: [...value.select].reverse(), data: [...value.data].reverse() };
  assert.equal(serializePolicy(value, context), serializePolicy(reversed, context));
  assert.deepEqual(readPolicy(value, context).data.find(rule => rule.field === 'tags').value.value, ['ไทย', 'русский', 'a', 'a']);
});

test('canonical serialization never mutates caller data', () => {
  const input = policy();
  const before = structuredClone(input);
  serializePolicy(input, context);
  compilePolicy(input, context);
  assert.deepEqual(input, before);
});

for (const [label, change] of [
  ['unknown root key', value => ({ ...value, include: {} })],
  ['unknown nested key', value => ({ ...value, select: [{ kind: 'field', field: 'id', extra: true }] })],
  ['unsupported version', value => ({ ...value, version: 2 })],
  ['unsupported operation', value => ({ ...value, operation: 'upsert' })],
  ['stale model', value => ({ ...value, model: 'Removed' })],
  ['stale field', value => ({ ...value, select: [{ kind: 'field', field: 'removed' }] })],
  ['missing key', value => { const { skip, ...rest } = value; return rest; }],
  ['duplicate projection', value => ({ ...value, select: [...value.select, ...value.select] })],
  ['duplicate filter', value => ({ ...value, where: [{ kind: 'scalar', field: 'email', operators: ['equals'] }, { kind: 'scalar', field: 'email', operators: ['contains'] }] })],
  ['duplicate operator', value => ({ ...value, where: [{ kind: 'scalar', field: 'email', operators: ['equals', 'equals'] }] })],
  ['unsupported operator', value => ({ ...value, where: [{ kind: 'scalar', field: 'email', operators: ['not'] }] })],
  ['empty operator shape', value => ({ ...value, where: [{ kind: 'scalar', field: 'email', operators: [] }] })],
  ['relation used as scalar projection', value => ({ ...value, select: [{ kind: 'field', field: 'posts' }] })],
  ['scalar used as relation projection', value => ({ ...value, select: [{ kind: 'relation', field: 'email', select: [], take: null }] })],
  ['duplicate ordering field', value => ({ ...value, orderBy: ['id', 'id'] })],
  ['javascript forced node', value => ({ ...value, where: [{ kind: 'forced', field: 'tenantId', value: { kind: 'expression', code: 'process.env.SECRET' } }] })],
  ['unknown forced-node key', value => ({ ...value, where: [{ kind: 'forced', field: 'tenantId', value: { kind: 'source', name: 'actorTenant', expression: 'x' } }] })],
]) test(`refuses ${label}`, () => rejects(change(policy())));

test('disabled policies still reject stale fields', () => rejects({ ...disabledPolicy(), select: [{ kind: 'field', field: 'removed' }] }));
test('validation returns a structured issue, not a permissive default', () => {
  const result = validatePolicy({ ...policy(), version: 0 }, context);
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].path, '$.version');
});

for (const [name, allowed] of [
  ['active', ['equals']], ['status', ['equals', 'in', 'notIn']], ['tags', ['equals', 'has', 'hasSome', 'hasEvery', 'isEmpty']],
  ['bytes', []], ['meta', ['equals']], ['id', ['equals', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte']],
]) test(`operator compatibility for ${name}`, () => assert.deepEqual(operatorsFor(field(name)), allowed));

for (const [name, operator] of [['active', 'contains'], ['id', 'contains'], ['status', 'gt'], ['tags', 'in'], ['meta', 'contains'], ['bytes', 'equals']]) {
  test(`refuses ${name}.${operator}`, () => rejects({ ...policy(), where: [{ kind: 'scalar', field: name, operators: [operator] }] }));
}

test('String mode is forced to default so prisma-guard cannot add an unrequested mode permission', () => {
  const compiled = compilePolicy({ ...policy(), where: [{ kind: 'scalar', field: 'email', operators: ['contains'] }] }, context);
  assert.equal(compiled.shape.where.email.contains, true);
  assert.equal(compiled.shape.where.email.mode[FORCED_MARKER], true);
  assert.equal(compiled.shape.where.email.mode.value, 'default');
});

test('policy filter permission is not a concrete query', () => {
  rejects({ ...policy(), where: { email: { contains: 'x' } } });
  rejects({ ...policy(), take: 25 });
  rejects({ ...policy('create'), data: { email: 'person@example.com' } });
});

for (const operation of ['findUnique', 'update', 'delete']) {
  test(`${operation}: complete compound selectors and forced predicates`, () => {
    const value = { ...policy(operation, 'Post'), unique: ['slugScope'] };
    const compiled = compilePolicy(value, context);
    assert.deepEqual(compiled.shape.where.slugScope, { tenantId: true, slug: true });
    rejects({ ...value, unique: ['slug'] });
    rejects({ ...value, unique: [] });
    rejects({ ...value, unique: ['slugScope', 'slugScope'] });
    rejects({ ...value, where: [forceRule('tenantId', 'tenant-a')] }, context, /conflicts/);
    const scoped = compilePolicy({ ...policy(operation), where: [forceRule('tenantId', 'tenant-a')] }, context);
    assert.equal(scoped.shape.where.tenantId[FORCED_MARKER], true);
    assert.equal(scoped.shape.where.tenantId.value, 'tenant-a');
  });
  test(`${operation}: rejects filter operator objects`, () => rejects({ ...policy(operation), where: [{ kind: 'scalar', field: 'id', operators: ['equals'] }] }));
}

test('create refuses filters and nested writes; updatedAt remains non-writable', () => {
  rejects({ ...policy('create'), where: [forceRule('tenantId', 'tenant-a')] });
  rejects({ ...policy('create'), data: [{ kind: 'client', field: 'posts' }] });
  rejects({ ...policy('update'), data: [{ kind: 'client', field: 'updatedAt' }] });
  rejects({ ...policy('create'), data: [] });
  rejects({ ...policy('update'), data: [] });
});

for (const [label, take] of [['zero', { default: 0, max: 100 }], ['negative', { default: -1, max: 100 }], ['default above max', { default: 101, max: 100 }], ['cap exceeded', { default: 25, max: 101 }], ['fraction', { default: 1.5, max: 100 }], ['unknown key', { default: 25, max: 100, min: 1 }], ['missing', null], ['unsafe integer', { default: 1, max: Number.MAX_SAFE_INTEGER + 1 }]]) {
  test(`pagination refuses ${label}`, () => rejects({ ...policy(), take }));
}

test('pagination and skip compile as policy data, not request values', () => {
  const compiled = compilePolicy({ ...policy(), skip: true, orderBy: ['email', 'id'] }, context);
  assert.deepEqual(compiled.shape.take, { default: 25, max: 100 });
  assert.equal(compiled.shape.skip, true);
  assert.deepEqual(compiled.shape.orderBy, { email: true, id: true });
  const ctx = freshContext(); ctx.capabilities.pagination.allowSkip = false;
  rejects({ ...policy(), skip: true }, ctx);
});
for (const operation of ['findUnique', 'create', 'update', 'delete']) {
  test(`${operation}: refuses list-only knobs`, () => {
    rejects({ ...policy(operation), skip: true });
    rejects({ ...policy(operation), take: { default: 1, max: 10 } });
    rejects({ ...policy(operation), orderBy: ['id'] });
  });
}

const relationSelection = (field, select, take = null) => ({ kind: 'relation', field, select, take });
const leaf = { kind: 'field', field: 'id' };
test('bounded to-many and to-one projection compilation', () => {
  const value = { ...policy(), select: [relationSelection('posts', [relationSelection('author', [leaf])], { default: 2, max: 10 })] };
  const compiled = compilePolicy(value, context);
  assert.deepEqual(compiled.shape.select.posts, { select: { author: { select: { id: true } } }, take: { default: 2, max: 10 } });
});
test('projection depth, missing bounds, empty relations and to-one pagination refuse', () => {
  rejects({ ...policy(), select: [relationSelection('manager', [relationSelection('manager', [relationSelection('manager', [leaf])])])] });
  rejects({ ...policy(), select: [relationSelection('posts', [leaf])] });
  rejects({ ...policy(), select: [relationSelection('posts', [], { default: 1, max: 2 })] });
  rejects({ ...policy(), select: [relationSelection('manager', [leaf], { default: 1, max: 2 })] });
});
test('relations are denied without an explicit bounded capability', () => {
  const ctx = freshContext(); ctx.capabilities.maxRelationDepth = 0; ctx.capabilities.models.forEach(model => { model.relations = []; });
  rejects({ ...policy(), select: [relationSelection('manager', [leaf])] }, ctx);
});
const relationFilter = (field, operator, where) => ({ kind: 'relation', field, branches: [{ operator, where }] });
const clientFilter = { kind: 'scalar', field: 'email', operators: ['equals'] };
test('relation where compiles supported operator branches without query execution', () => {
  const value = { ...policy(), where: [relationFilter('posts', 'some', [relationFilter('author', 'is', [clientFilter])])] };
  const compiled = compilePolicy(value, context);
  assert.equal(compiled.shape.where.posts.some.author.is.email.equals, true);
});
test('relation filter refuses incompatible, empty, duplicate and excessive-depth branches', () => {
  rejects({ ...policy(), where: [relationFilter('posts', 'is', [clientFilter])] });
  rejects({ ...policy(), where: [relationFilter('manager', 'some', [clientFilter])] });
  rejects({ ...policy(), where: [relationFilter('manager', 'is', [])] });
  const relation = relationFilter('manager', 'is', [clientFilter]); relation.branches.push(...relation.branches);
  rejects({ ...policy(), where: [relation] });
  rejects({ ...policy(), where: [relationFilter('manager', 'is', [relationFilter('manager', 'is', [relationFilter('manager', 'is', [clientFilter])])])] });
});
test('negative relation predicates cannot weaken forced scope', () => {
  rejects({ ...policy(), where: [relationFilter('manager', 'isNot', [forceRule('tenantId', 'tenant-a')])] });
  rejects({ ...policy(), where: [relationFilter('posts', 'none', [forceRule('tenantId', 'tenant-a')])] });
});

for (const [name, value] of [['active', true], ['active', false], ['name', null], ['score', 1.5], ['id', 1], ['status', 'ACTIVE'], ['tags', ['a', 'b']], ['meta', { a: true, b: [1, null] }], ['total', '9223372036854775807'], ['born', '2026-09-21T00:00:00.000Z'], ['amount', '1.123456789']]) {
  test(`static forced literal ${name} ${JSON.stringify(value)} stays forced`, () => {
    const input = { ...policy('create'), data: [forceRule(name, value)] };
    const compiled = compilePolicy(input, context);
    assert.equal(compiled.shape.data[name][FORCED_MARKER], true);
    assert.deepEqual(compiled.shape.data[name].value, value);
    assert.match(previewCompiledPolicy(compiled), /"\$force"/);
  });
}
for (const [name, value] of [['active', 'true'], ['id', 1.2], ['id', 2147483648], ['email', null], ['status', 'REMOVED'], ['tags', ['a', 1]], ['meta', null], ['total', '9223372036854775808'], ['total', 1], ['born', '2026-02-30T00:00:00.000Z'], ['born', '2026-09-21'], ['amount', 'NaN'], ['bytes', 'AA==']]) {
  test(`incompatible forced literal ${name} ${JSON.stringify(value)} refuses`, () => assert.throws(() => validateLiteral(value, field(name), '$')));
}

test('named sources require explicit consumer resolution and remain policy data', () => {
  const value = { ...policy(), where: [{ kind: 'forced', field: 'tenantId', value: { kind: 'source', name: 'actorTenant' } }] };
  assert.equal(readPolicy(value, context).where[0].value.kind, 'source');
  assert.throws(() => compilePolicy(value, context), /resolver/);
  const requests = [];
  const compiled = compilePolicy(value, context, request => { requests.push(request); return 'tenant-a'; });
  assert.deepEqual(requests, [{ source: 'actorTenant', model: 'User', field: 'tenantId', target: 'where' }]);
  assert.equal(compiled.shape.where.tenantId.equals.value, 'tenant-a');
  assert.throws(() => compilePolicy(value, context, () => undefined));
  assert.throws(() => compilePolicy(value, context, () => Promise.resolve('tenant-a')));
  assert.throws(() => compilePolicy(value, context, () => 123));
  assert.throws(() => compilePolicy(value, context, () => { throw new Error('sensitive resolver error'); }), error => !error.message.includes('sensitive'));
});
test('unknown source and source granted to a different field refuse', () => {
  for (const [field, source] of [['tenantId', 'missing'], ['email', 'actorTenant']]) rejects({ ...policy(), where: [{ kind: 'forced', field, value: { kind: 'source', name: source } }] });
});
test('client fields cannot overlap forced fields', () => rejects({ ...policy('create'), data: [{ kind: 'client', field: 'email' }, forceRule('email', 'x')] }));

for (const [label, edit] of [
  ['unknown capability key', ctx => { ctx.capabilities.extra = true; }],
  ['stale capability field', ctx => { ctx.capabilities.models[0].select.push('removed'); }],
  ['duplicate model grant', ctx => { ctx.capabilities.models.push(ctx.capabilities.models[0]); }],
  ['unsupported operation grant', ctx => { ctx.capabilities.operations.push('upsert'); }],
  ['out-of-range depth', ctx => { ctx.capabilities.maxRelationDepth = 6; }],
  ['unknown source metadata', ctx => { ctx.capabilities.sources[0].code = 'x'; }],
  ['duplicate source', ctx => { ctx.capabilities.sources.push(ctx.capabilities.sources[0]); }],
  ['duplicate enum value', ctx => { ctx.schema.models.find(model => model.name === 'User').fields.find(field => field.name === 'status').values.push('ACTIVE'); }],
  ['unknown normalized field key', ctx => { ctx.schema.models[0].fields[0].extra = true; }],
  ['stale relation target', ctx => { ctx.schema.models.find(model => model.name === 'User').fields.find(field => field.name === 'posts').model = 'Removed'; }],
]) test(`strict descriptor/capability readers: ${label}`, () => { const ctx = freshContext(); edit(ctx); rejects(policy(), ctx); });

test('consumer can narrow operations, fields, operators and named sources', () => {
  const ctx = freshContext();
  ctx.capabilities.operations = ['findMany'];
  const cap = ctx.capabilities.models.find(model => model.model === 'User');
  cap.select = ['id']; cap.where = [{ field: 'email', operators: ['equals'] }]; cap.forced = [];
  readPolicy(policy(), ctx);
  rejects(policy('create'), ctx);
  rejects({ ...policy(), select: [{ kind: 'field', field: 'email' }] }, ctx);
  rejects({ ...policy(), where: [{ kind: 'scalar', field: 'email', operators: ['contains'] }] }, ctx);
});

test('normalized schema and capabilities round trip as deterministic JSON', () => {
  assert.deepEqual(readSchema(JSON.parse(canonicalJson(context.schema))), context.schema);
  assert.deepEqual(readCapabilities(JSON.parse(canonicalJson(context.capabilities)), context.schema), context.capabilities);
});

for (const value of ['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"__proto__":{}}', '[1,]', '{"x":1,}', '01', '+1', '1e999', 'NaN', 'undefined', '{"x":}', '"a\nb"', 'true false', '{"x" 1}']) {
  test(`strict JSON refuses ${JSON.stringify(value)}`, () => assert.throws(() => parseJson(value)));
}
test('strict JSON accepts standard grammar and preserves escaped Unicode', () => {
  for (const value of ['null', 'true', 'false', '-0', '1.25e+2', '"\\u0e44\\u0e17\\u0e22"', '{"a":[1,"\\\\\\\"",null]}']) assert.deepEqual(parseJson(value), JSON.parse(value) === 0 ? 0 : JSON.parse(value));
});
test('non-JSON values, accessors, hidden properties and prototype pollution fail closed without invoking getters', () => {
  const cycle = {}; cycle.self = cycle;
  const accessor = {}; let called = false; Object.defineProperty(accessor, 'x', { enumerable: true, get: () => { called = true; return 1; } });
  const hidden = {}; Object.defineProperty(hidden, 'x', { value: 1 });
  const extraArray = []; extraArray.extra = 1;
  for (const value of [cycle, accessor, hidden, extraArray, new Array(1), new Date(), new Map(), () => 1, undefined, NaN, Infinity, 1n, { [Symbol('x')]: true }]) assert.throws(() => readJsonValue(value));
  assert.equal(called, false);
  assert.equal({}.polluted, undefined);
});
test('JSON complexity is bounded', () => {
  assert.throws(() => parseJson('['.repeat(66) + '0' + ']'.repeat(66)), /limit/);
  assert.throws(() => parseJson('"' + 'a'.repeat(262144) + '"'), /limit/);
  assert.throws(() => readJsonValue(Array.from({ length: 20001 }, () => 1)), /JSON/);
});

for (const reserved of ['AND', 'OR', 'NOT', '_count']) {
  test(`descriptor refuses reserved guard field ${reserved}`, () => {
    const { schema } = freshContext();
    schema.models[0].fields[0].name = reserved;
    assert.throws(() => readSchema(schema), /guard control syntax/);
  });
}

test('negative relation string filters cannot conceal compiler-inserted forced mode', () => {
  const candidate = policy();
  candidate.where = [{ kind: 'relation', field: 'posts', branches: [{ operator: 'none', where: [
    { kind: 'scalar', field: 'title', operators: ['contains'] },
  ] }] }];
  assert.throws(() => readPolicy(candidate, context), /forced default mode/);
  candidate.where[0].branches[0].where[0].operators = ['in'];
  assert.doesNotThrow(() => compilePolicy(candidate, context));
});

test('disabled policies do not compile or resolve named sources', () => {
  const candidate = policy('create');
  candidate.enabled = false;
  candidate.data.push({ kind: 'forced', field: 'tenantId', value: { kind: 'source', name: 'actorTenant' } });
  let calls = 0;
  const result = compilePolicy(candidate, context, () => { calls += 1; return 'tenant'; });
  assert.equal(result.enabled, false);
  assert.equal(calls, 0);
  assert.equal('shape' in result, false);
  assert.doesNotThrow(() => compilePolicy(candidate, context));
});

test('a source-shaped JSON literal is data, not a nested resolver instruction', () => {
  const candidate = policy('create');
  const literal = { kind: 'source', name: 'actorTenant' };
  candidate.data.push({ kind: 'forced', field: 'meta', value: { kind: 'literal', value: literal } });
  const result = compilePolicy(candidate, context);
  assert.deepEqual(result.shape.data.meta.value, literal);
  assert.notEqual(result.shape.data.meta.value, literal);
});


test('public operation constants cannot be mutated to widen the validator', () => {
  assert.equal(Object.isFrozen(OPERATIONS), true);
  assert.throws(() => OPERATIONS.push('upsert'), TypeError);
  rejects({ ...policy(), operation: 'upsert' });
});

test('named sources require visible consumer labels', () => {
  const ctx = freshContext();
  ctx.capabilities.sources[0].label = ' \t\n';
  assert.throws(() => readCapabilities(ctx.capabilities, ctx.schema), /visible consumer source label/);
});
