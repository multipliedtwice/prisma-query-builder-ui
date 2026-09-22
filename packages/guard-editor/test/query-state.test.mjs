import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuerySchema, setValue, valueAt, parseQueryLiteral, parsePrismaQuery, normalizePrismaPayload } from '../dist/query/index.js';
import { templateContext } from './fixtures/templates.ts';

const schema = createQuerySchema(templateContext);
const operation = schema.operation('User', 'findMany');
test('original query schema interface exposes actual Prisma arguments', () => { assert.deepEqual(operation.args.map(arg => arg.name), ['select', 'include', 'where', 'orderBy', 'take', 'skip']); assert.equal(operation.model, 'User'); });
test('nested relation editing uses the original type-to-field navigation contract', () => {
  const projection = schema.getInputTypeFields(operation.args.find(arg => arg.name === 'select').objectTypeName);
  const posts = projection.find(field => field.name === 'posts'); assert.ok(posts.objectTypeName);
  const args = schema.getInputTypeFields(posts.objectTypeName); assert.ok(args.some(arg => arg.name === 'select')); assert.ok(args.some(arg => arg.name === 'where'));
  const fields = schema.getInputTypeFields(args.find(arg => arg.name === 'select').objectTypeName); assert.ok(fields.some(field => field.name === 'title'));
});
test('original compact scalar operator navigation retains contains and enums', () => {
  const where = schema.getInputTypeFields('UserWhereInput'); const name = where.find(field => field.name === 'name');
  assert.ok(schema.getInputTypeFields(name.objectTypeName).some(field => field.name === 'contains')); assert.deepEqual(schema.getEnumValues('SortOrder'), ['asc', 'desc']);
});
test('controlled path edits are immutable and preserve sibling branches', () => {
  const original = { select: { id: true }, where: { id: 1 } }; const next = setValue(original, ['select', 'posts', 'select', 'title'], true);
  assert.deepEqual(original, { select: { id: true }, where: { id: 1 } }); assert.equal(valueAt(next, ['select', 'posts', 'select', 'title']), true); assert.deepEqual(next.where, original.where);
});
test('removing the last object field prunes empty argument parents', () => { assert.deepEqual(setValue({ where: { name: { contains: 'x' } }, select: { id: true } }, ['where', 'name', 'contains'], undefined), { select: { id: true } }); });
test('removing an array field retains other items and array index semantics', () => { assert.deepEqual(setValue({ where: { AND: [{ id: 1 }, { id: 2 }] } }, ['where', 'AND', '0'], undefined), { where: { AND: [{ id: 2 }] } }); });
test('malicious path and sparse array access are rejected', () => { assert.throws(() => setValue({}, ['__proto__', 'polluted'], true)); assert.throws(() => setValue({ data: [] }, ['data', '10000'], true)); });
test('missing value lookup never traverses inherited properties', () => { assert.equal(valueAt({}, ['constructor']), undefined); });
test('query preview normalizes only Prisma code presentation conventions', () => { assert.deepEqual(normalizePrismaPayload({ distinct: 'id', orderBy: { id: 'asc' } }), { distinct: ['id'], orderBy: [{ id: 'asc' }] }); });
test('safe literal parser preserves nested Prisma input, escapes, and trailing commas', () => {
  assert.deepEqual(parseQueryLiteral("{where: {name: {contains: 'A\\\'B'}, id: {in: [1, 2,],},}, select: {id: true,},}"), { where: { name: { contains: "A'B" }, id: { in: [1, 2] } }, select: { id: true } });
});
test('readable Prisma code parses to concrete payload without executing source', () => { assert.deepEqual(parsePrismaQuery('await prisma.user.findMany({ where: { id: 1 }, take: 10 });', operation), { where: { id: 1 }, take: 10 }); });
for (const source of ['{id: 1, id: 2}', '{__proto__: {polluted: true}}', '{id: undefined}', '{id: NaN}', '{id: Infinity}', '{id: new Date()}', '{id: (()=>1)()}', '{...other}', '{id: 1 + 2}', '{[variable]: 1}', '{ get id() { return 1; } }', '{id: 999999999999999999999999999999999999e999}', '{}; fetch("/run")', '[1,2]', '{id: Symbol()}', '{id: 1n}']) test(`query parser refuses executable or ambiguous input: ${source}`, () => assert.throws(() => parseQueryLiteral(source)));
for (const source of ['await prisma.post.findMany({});', 'await prisma.user.delete({where:{id:1}});', 'prisma.user.findMany({});', 'await prisma.user.findMany({}); process.exit();', 'await prisma.user.findManyOther({});']) test('query code cannot switch model/operation or append execution', () => assert.throws(() => parsePrismaQuery(source, operation)));
