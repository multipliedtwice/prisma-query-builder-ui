import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveGuard, inspectTemplate, generateUsageManifest, readSavedQuery, readSavedQueries, readUsageManifest, serializeSavedQuery, editTemplate, reviewTemplate, beginSave, acknowledgeSave, queryChanged, assertStableIdentity, QUERY_OPERATIONS } from '../dist/templates/index.js';
import { FORCED_MARKER } from '../dist/core/compiler.js';
import { exampleQueries, templateContext, exampleManifest, trustedExample } from './fixtures/templates.ts';

const clone = value => structuredClone(value);
const query = (payload = { select: { id: true } }, operation = 'findMany', extra = {}) => readSavedQuery({ version: 1, id: 'example', name: 'Example query', model: 'User', operation, usageKey: 'example', payload, enabled: true, accepted: true, schema: templateContext.identity, ...extra });
const derive = (payload, operation = 'findMany', extra = {}) => deriveGuard(query(payload, operation, extra), templateContext).shape;
const generate = (queries = exampleQueries, manifest = exampleManifest, trusted = trustedExample, context = templateContext, resolver) => generateUsageManifest(queries, manifest, context, trusted, resolver);
const rejects = (payload, operation = 'findMany', extra = {}) => assert.throws(() => derive(payload, operation, extra));
const payloads = {
  findMany: { select: { id: true }, take: 25 }, findFirst: { select: { id: true }, where: { active: true } },
  findUnique: { where: { id: 2 }, select: { email: true } }, create: { data: { email: 'name@example.test', tenantId: 'ordinary-example' }, select: { id: true } },
  update: { where: { id: 1 }, data: { name: 'Renamed' }, select: { id: true } }, delete: { where: { id: 1 }, select: { id: true } },
};
for (const operation of QUERY_OPERATIONS) test(`accepted concrete ${operation} derives only supported operation arguments`, () => {
  const result = deriveGuard(query(payloads[operation], operation), templateContext);
  assert.equal(result.operation, operation); assert.equal(result.requirements.enforceProjection, true); assert.equal(result.requirements.trustedVariantSelection, true);
});
for (const candidate of exampleQueries) test(`recorded-pattern example ${candidate.usageKey} is an accepted typed template`, () => assert.equal(inspectTemplate(candidate, templateContext).state, 'accepted'));
test('several operations and separate variants under one model survive generation', () => {
  const output = generate(); assert.equal(output.variants.length, 5); assert.equal(output.routes.length, 6);
  assert.equal(output.variants.filter(item => item.operation === 'findMany').length, 2);
  assert.equal(output.variantSelection, 'trusted-server-route-only');
});
test('two trusted routes explicitly reuse one saved query without duplication', () => {
  const output = generate(); assert.deepEqual(output.routes.filter(route => route.queryId === 'public-profile').map(route => route.routeId), ['profile.page', 'profile.summary']);
  assert.equal(output.variants.filter(item => item.queryId === 'public-profile').length, 1);
});
test('projections, filters, ordering, and pagination never leak across variants', () => {
  const output = generate(); const get = id => output.variants.find(query => query.queryId === id).shape;
  assert.equal(get('account').select.email, true); assert.equal(get('public-profile').select.email, undefined);
  assert.equal(get('company-dashboard').where.active.equals, true); assert.equal(get('company-dashboard').where.name, undefined);
  assert.equal(get('talent-search').where.name.contains, true); assert.equal(get('talent-search').where.active, undefined);
  assert.equal(get('company-dashboard').skip, undefined); assert.equal(get('talent-search').skip, true);
});
test('ordinary literals never become trusted user, tenant, or deleted constraints', () => {
  const shape = derive({ select: { id: true }, where: { id: 51, active: false, tenantId: 'tenant-sample' } });
  assert.equal(shape.where.id.equals, true); assert.equal(shape.where.active.equals, true); assert.equal(shape.where.tenantId.equals, true);
  assert.equal(shape.where.tenantId.mode.value, 'default'); assert.equal(shape.where.tenantId.mode[FORCED_MARKER], true);
  assert.ok(!JSON.stringify(shape).includes('tenant-sample'));
});
test('mutation examples become represented writable leaves, never forced values', () => {
  const result = derive(payloads.create, 'create'); assert.equal(result.data.email, true); assert.equal(result.data.tenantId, true);
  assert.ok(!JSON.stringify(result).includes('ordinary-example'));
});
test('nested projection, filters, ordering, and bounds are preserved', () => {
  const shape = derive({ select: { posts: { select: { title: true }, where: { published: true }, orderBy: { id: 'desc' }, take: 3, skip: 0 } } });
  assert.deepEqual(shape.select.posts.select, { title: true }); assert.deepEqual(shape.select.posts.take, { default: 3, max: 3 });
  assert.equal(shape.select.posts.where.published.equals, true); assert.equal(shape.select.posts.orderBy.id, true); assert.equal(shape.select.posts.skip, true);
});
test('include remains include; implicit scalar projection is resolved against the reviewed schema', () => {
  const shape = derive({ include: { posts: { select: { title: true } } } }); assert.ok(shape.include.posts.select.title); assert.equal(shape.select, undefined);
  const defaults = derive({}); assert.ok(defaults.select.id); assert.ok(defaults.select.email); assert.equal(defaults.select.posts, undefined);
});
test('relation true is bounded and expanded to a fixed scalar projection', () => {
  const shape = derive({ select: { posts: true } }); assert.equal(shape.select.posts.select.title, true); assert.equal(shape.select.posts.select.author, undefined);
  assert.throws(() => deriveGuard(query({ select: { posts: true } }), { ...templateContext, maxRelationDepth: 0 }));
});
test('positive saved take is both default and maximum; absent skip and take are absent', () => {
  assert.deepEqual(derive({ take: 19 }).take, { default: 19, max: 19 }); assert.equal(derive({}).take, undefined); assert.equal(derive({}).skip, undefined);
});
test('compound unique selectors require all constituent fields', () => {
  const payload = { where: { slugScope: { tenantId: 'sample', slug: 'entry' } }, select: { id: true } };
  assert.deepEqual(derive(payload, 'findUnique', { model: 'Post' }).where.slugScope, { slug: true, tenantId: true });
  rejects({ ...payload, where: { slugScope: { slug: 'entry' } } }, 'findUnique', { model: 'Post' });
});
test('array item shape is retained only when homogeneous, never widened by union', () => {
  assert.deepEqual(derive({ where: { AND: [{ id: 1 }, { id: 2 }] } }).where.AND, { id: { equals: true } });
  rejects({ where: { OR: [{ id: 1 }, { email: 'other' }] } }); rejects({ orderBy: [{ id: 'asc' }, { email: 'desc' }] });
});
test('represented connect is supported without enabling other nested writes', () => {
  const shape = derive({ where: { id: 1 }, data: { posts: { connect: [{ id: 2 }, { id: 3 }] } }, select: { id: true } }, 'update');
  assert.deepEqual(shape.data.posts, { connect: { id: true } }); assert.equal(shape.data.posts.create, undefined);
});
test('scalar lists retain only represented operators', () => {
  const shape = derive({ where: { tags: { has: 'query', isEmpty: false } } }); assert.deepEqual(shape.where.tags, { has: true, isEmpty: true });
});
test('nullable equality is allowed but nullable contains is not valid Prisma input', () => {
  assert.equal(derive({ where: { name: { equals: null } } }).where.name.equals, true); rejects({ where: { name: { contains: null } } });
});
test('safe integer BigInt examples remain concrete query values', () => {
  assert.equal(derive({ where: { total: 12 } }).where.total.equals, true); rejects({ where: { total: 1.5 } });
});
for (const [name, payload, operation = 'findMany'] of [
  ['unknown top-level', { bogus: true }], ['raw SQL', { queryRaw: 'SELECT 1' }], ['cursor', { cursor: { id: 1 } }], ['distinct', { distinct: ['id'] }],
  ['grouping', { by: ['id'] }], ['having', { having: { id: 1 } }], ['projection conflict', { select: { id: true }, include: { posts: true } }],
  ['false projection', { select: { id: false } }], ['scalar include', { include: { email: true } }], ['unknown projection', { select: { missing: true } }],
  ['empty projection', { select: {} }], ['empty filter', { where: {} }], ['unknown filter', { where: { missing: 1 } }],
  ['invalid Boolean operator', { where: { active: { contains: 'x' } } }], ['list isEmpty type', { where: { tags: { isEmpty: 'false' } } }],
  ['nested not expression', { where: { id: { not: { equals: 1 } } } }], ['ambiguous Json filter', { where: { meta: { equals: {} } } }],
  ['null String in-list', { where: { name: { in: [null] } } }], ['empty in-list', { where: { id: { in: [] } } }],
  ['negative take', { take: -1 }], ['zero take', { take: 0 }], ['excessive take', { take: 101 }], ['fractional take', { take: 2.5 }], ['negative skip', { skip: -1 }],
  ['unknown order', { orderBy: { missing: 'asc' } }], ['invalid direction', { orderBy: { id: 'up' } }], ['relation count order', { orderBy: { posts: { _count: 'asc' } } }],
  ['missing unique', {}, 'findUnique'], ['nonunique selector', { where: { name: 'A' } }, 'findUnique'], ['null unique', { where: { email: null } }, 'findUnique'],
  ['readonly mutation', { where: { id: 1 }, data: { updatedAt: '2026-01-01T00:00:00Z' } }, 'update'],
  ['missing mutation data', { where: { id: 1 } }, 'update'], ['empty mutation data', { where: { id: 1 }, data: {} }, 'update'],
  ['nested create', { where: { id: 1 }, data: { posts: { create: { title: 'X' } } } }, 'update'],
  ['heterogeneous connect', { where: { id: 1 }, data: { manager: { connect: [{ id: 1 }, { email: 'x@example.test' }] } } }, 'update'],
  ['missing required create field', { data: { email: 'x@example.test' } }, 'create'],
  ['ordering a unique lookup', { where: { id: 1 }, orderBy: { id: 'asc' } }, 'findUnique'],
]) test(`derivation fails closed for ${name}`, () => rejects(payload, operation));
test('trusted constraints are separate, typed, explicit, and do not mutate the template', () => {
  const input = query({ select: { id: true }, where: { tenantId: 'sample' } }); const before = serializeSavedQuery(input);
  const constraints = [{ target: 'where', field: 'tenantId', value: { kind: 'source', name: 'actor.tenant' } }];
  assert.throws(() => deriveGuard(input, templateContext, constraints), /resolver/);
  const output = deriveGuard(input, templateContext, constraints, request => { assert.equal(request.source, 'actor.tenant'); assert.equal(request.usageKey, 'example'); assert.ok(Object.isFrozen(request)); return 'server-tenant'; });
  assert.equal(output.shape.where.tenantId.equals.value, 'server-tenant'); assert.equal(output.shape.where.tenantId.equals[FORCED_MARKER], true); assert.equal(serializeSavedQuery(input), before);
});
test('server constraints can supply required create fields without inventing query literals', () => {
  const input = query({ data: { email: 'x@example.test' }, select: { id: true } }, 'create');
  const constraints = [{ target: 'data', field: 'tenantId', value: { kind: 'source', name: 'actor.tenant' } }];
  assert.equal(inspectTemplate(input, templateContext, constraints).state, 'accepted');
  assert.equal(deriveGuard(input, templateContext, constraints, () => 'tenant').shape.data.tenantId.value, 'tenant');
});
for (const [name, constraints, resolver] of [
  ['duplicate constraint', [{ target: 'where', field: 'id', value: { kind: 'literal', value: 1 } }, { target: 'where', field: 'id', value: { kind: 'literal', value: 2 } }]],
  ['invalid forced type', [{ target: 'where', field: 'id', value: { kind: 'literal', value: 'bad' } }]],
  ['unknown source', [{ target: 'where', field: 'id', value: { kind: 'source', name: 'actor.id' } }]],
  ['wrong resolved type', [{ target: 'where', field: 'id', value: { kind: 'source', name: 'actor.id' } }], () => 'not-an-integer'],
  ['resolver exception', [{ target: 'where', field: 'id', value: { kind: 'source', name: 'actor.id' } }], () => { throw new Error('private secret'); }],
  ['unknown field', [{ target: 'where', field: 'unknown', value: { kind: 'literal', value: 1 } }]],
  ['mutation constraint on read', [{ target: 'data', field: 'id', value: { kind: 'literal', value: 1 } }]],
]) test(`trusted extension refuses ${name}`, () => { assert.throws(() => deriveGuard(query(), templateContext, constraints, resolver)); });
test('resolver failures do not disclose the server error', () => {
  assert.throws(() => deriveGuard(query(), templateContext, [{ target: 'where', field: 'id', value: { kind: 'source', name: 'actor.id' } }], () => { throw new Error('secret'); }), error => !error.message.includes('secret'));
});
test('operation and variant hooks stay named and ordered outside the query payload', () => {
  const trusted = clone(trustedExample); trusted.operations = [{ model: 'User', operation: 'findUnique', hooks: { before: ['operation.before'], after: ['operation.after'] } }];
  trusted.variants = [{ queryId: 'public-profile', constraints: [], hooks: { before: ['variant.before'], after: ['variant.after'] } }];
  const generated = generate(exampleQueries, exampleManifest, trusted); const route = generated.routes.find(route => route.routeId === 'profile.page');
  assert.deepEqual(route.hooks, { before: ['operation.before', 'variant.before'], after: ['variant.after', 'operation.after'] });
  assert.deepEqual(generated.routes.find(route => route.routeId === 'account.page').hooks, { before: ['operation.before'], after: ['operation.after'] });
  trusted.variants[0].hooks.before = ['unknown']; assert.throws(() => generate(exampleQueries, exampleManifest, trusted));
});
for (const [name, mutate] of [
  ['missing route mapping', (q, m) => m.bindings.pop()], ['duplicate route mapping', (q, m) => m.bindings.push(clone(m.bindings[0]))],
  ['unknown route mapping', (q, m) => m.bindings[0].routeId = 'client-arbitrary'], ['unknown query mapping', (q, m) => m.bindings[0].queryId = 'missing'],
  ['wrong usage mapping', (q, m) => m.bindings[0].usageKey = 'account'], ['wrong operation mapping', (q, m) => m.bindings[0].operation = 'delete'],
  ['wrong model mapping', (q, m) => m.bindings[0].model = 'Post'], ['stale manifest', (q, m) => m.schema.revision = 'old'],
  ['stale query', q => q[0].schema.revision = 'old'], ['disabled mapped query', q => q[0].enabled = false], ['unaccepted mapped query', q => q[0].accepted = false],
  ['duplicate saved query id', q => q.push(clone(q[0]))], ['duplicate usage variant', q => q.push({ ...clone(q[0]), id: 'other-id' })],
  ['unmapped accepted query', q => q.push({ ...clone(q[0]), id: 'other', usageKey: 'another' })],
]) test(`usage generation refuses ${name}`, () => { const q = clone(exampleQueries), m = clone(exampleManifest); mutate(q, m); assert.throws(() => generate(q, m)); });
test('deterministic derivation survives input key and collection ordering changes', () => {
  const first = derive({ where: { id: { equals: 1 }, active: true }, select: { name: true, id: true }, take: 5 });
  const second = derive({ take: 5, select: { id: true, name: true }, where: { active: true, id: { equals: 100 } } }); assert.deepEqual(first, second);
  assert.deepEqual(generate([...exampleQueries].reverse(), { ...exampleManifest, bindings: [...exampleManifest.bindings].reverse() }), generate());
});
test('schema revision changes make a query stale and generation impossible until explicit review', () => {
  const nextContext = { ...templateContext, identity: { ...templateContext.identity, revision: '2' } };
  const item = query(); assert.equal(inspectTemplate(item, nextContext).state, 'stale'); assert.throws(() => deriveGuard(item, nextContext));
  const reviewed = reviewTemplate(item, nextContext); assert.equal(reviewed.schema.revision, '2'); assert.equal(deriveGuard(reviewed, nextContext).schema.revision, '2');
});
test('schema field removal blocks review rather than dropping a selected field', () => {
  const next = clone(templateContext); const model = next.schema.models.find(model => model.name === 'User'); model.fields = model.fields.filter(field => field.name !== 'name');
  assert.throws(() => reviewTemplate(query({ select: { name: true } }), next));
});
test('draft, disabled, accepted, invalid, and stale states remain distinct', () => {
  assert.equal(inspectTemplate(query({}, 'findMany', { accepted: false }), templateContext).state, 'draft');
  assert.equal(inspectTemplate(query({}, 'findMany', { enabled: false }), templateContext).state, 'disabled');
  assert.equal(inspectTemplate(query(), templateContext).state, 'accepted'); assert.equal(inspectTemplate(query({ bad: true }), templateContext).state, 'invalid');
  assert.throws(() => deriveGuard(query({}, 'findMany', { enabled: false }), templateContext));
});
test('create, rename, duplicate, save, reload, and delete preserve stable identity and separate usages', () => {
  const original = query({}, 'findMany', { accepted: false }); const renamed = readSavedQuery({ ...original, name: 'Renamed' });
  assertStableIdentity(original, renamed); const copy = readSavedQuery({ ...renamed, id: 'duplicate', usageKey: 'duplicate' });
  let collection = readSavedQueries([renamed, copy]); const ticket = beginSave(copy, templateContext); const persisted = acknowledgeSave(ticket, JSON.parse(serializeSavedQuery(ticket.query)));
  assert.equal(queryChanged(copy, persisted), false); collection = collection.filter(item => item.id !== original.id); assert.deepEqual(collection.map(item => item.id), ['duplicate']);
});
test('dirty state remains per-query when switching tabs and saving another query', () => {
  const saved = exampleQueries.map(clone); const edited = editTemplate(saved[0], { ...saved[0].payload, select: { id: true } });
  assert.ok(queryChanged(edited, saved[0])); assert.equal(queryChanged(saved[1], saved[1]), false);
  const ticket = beginSave(saved[1], templateContext); acknowledgeSave(ticket, saved[1]); assert.ok(queryChanged(edited, saved[0])); assert.equal(edited.accepted, false);
});
test('navigation/no-op edit does not invalidate acceptance', () => { const item = query(); assert.equal(editTemplate(item, clone(item.payload)), item); });
test('save tickets pin exact snapshots; later edits cannot be acknowledged by old completion', () => {
  const original = query(); const ticket = beginSave(original, templateContext); const edited = editTemplate(original, { select: { email: true } });
  const acknowledged = acknowledgeSave(ticket, original); assert.ok(queryChanged(edited, acknowledged)); assert.throws(() => acknowledgeSave(ticket, edited));
});
test('save rejection leaves original and edited values intact and can be retried', () => {
  const original = query(); const edited = editTemplate(original, { select: { email: true } }); const before = serializeSavedQuery(edited); const ticket = beginSave(edited, templateContext);
  assert.throws(() => acknowledgeSave(ticket, { ...edited, id: 'other' })); assert.equal(serializeSavedQuery(edited), before); assert.deepEqual(acknowledgeSave(beginSave(edited, templateContext), edited), edited);
});
test('accepted invalid query cannot be saved; invalid drafts can be retained for editing', () => {
  assert.throws(() => beginSave(query({ bad: true }), templateContext)); assert.ok(beginSave(query({ bad: true }, 'findMany', { accepted: false }), templateContext));
});
test('large readable names and many variants remain distinct', () => {
  const items = Array.from({ length: 40 }, (_, index) => query({}, 'findMany', { id: `query-${index}`, usageKey: `usage-${index}`, name: 'Long model query name '.repeat(15), accepted: false }));
  assert.equal(readSavedQueries(items).length, 40);
});
for (const input of [{ arbitrary: true }, { ...query(), extra: true }, { ...query(), payload: [] }, { ...query(), usageKey: 'User_Supplied' }, { ...query(), name: '   ' }, { ...query(), operation: 'findManyPaginated' }]) test('saved query reader rejects unsupported or malformed metadata', () => assert.throws(() => readSavedQuery(input)));
test('stored canonical form round-trips without executable or force objects', () => { const item = query(); assert.deepEqual(readSavedQuery(JSON.parse(serializeSavedQuery(item))), item); assert.throws(() => readSavedQuery({ ...item, payload: { where: { id: () => 1 } } })); });
test('to-one relation connect cannot use an array even with homogeneous selectors', () => {
  rejects({ where: { id: 1 }, data: { manager: { connect: [{ id: 2 }, { id: 3 }] } } }, 'update');
});
for (const id of ['__proto__', 'constructor', 'prototype']) test(`reserved query identity ${id} cannot corrupt per-query UI state`, () => assert.throws(() => query({}, 'findMany', { id })));
test('explicit trusted JSON values have deterministic key ordering', () => {
  const input = query({ where: { id: 1 }, data: { name: 'Sample' }, select: { id: true } }, 'update');
  const compile = value => deriveGuard(input, templateContext, [{ target: 'data', field: 'meta', value: { kind: 'literal', value } }]);
  assert.deepEqual(compile({ a: { c: 1, d: 2 }, z: 3 }), compile({ z: 3, a: { d: 2, c: 1 } }));
  assert.deepEqual(Object.keys(compile({ z: 3, a: 1 }).shape.data.meta.value), ['a', 'z']);
});
