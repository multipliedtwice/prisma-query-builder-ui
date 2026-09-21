import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { normalizeDmmf } from '../dist/adapters/dmmf.js';
import { readCapabilities } from '../dist/index.js';

const fixture = version => JSON.parse(fs.readFileSync(new URL(`./fixtures/dmmf-${version}.json`, import.meta.url), 'utf8'));
const model = (schema, name) => schema.models.find(model => model.name === name);
const field = (schema, name, key) => model(schema, name).fields.find(field => field.name === key);

for (const version of ['6.19.3', '7.3.0']) {
  test(`Prisma ${version} structural contract: normalized descriptors and complete selector names`, () => {
    const input = fixture(version);
    const copy = JSON.stringify(input);
    const schema = normalizeDmmf(input);
    assert.equal(JSON.stringify(input), copy);
    assert.equal(schema.version, 1);
    assert.deepEqual(model(schema, 'User').uniqueSelectors, [{ name: 'email', fields: ['email'] }, { name: 'id', fields: ['id'] }]);
    assert.deepEqual(model(schema, 'Post').uniqueSelectors, [{ name: 'authorSlug', fields: ['authorId', 'slug'] }, { name: 'tenantId_slug', fields: ['tenantId', 'slug'] }]);
    assert.deepEqual(field(schema, 'User', 'state'), { name: 'state', kind: 'enum', list: false, nullable: false, writable: true, hasDefault: true, type: 'State', values: ['ACTIVE', 'INACTIVE'] });
    assert.equal(field(schema, 'User', 'displayName').nullable, true);
    assert.equal(field(schema, 'User', 'tags').list, true);
    assert.equal(field(schema, 'User', 'id').hasDefault, true);
    assert.equal(field(schema, 'User', 'updatedAt').writable, false);
    assert.equal(field(schema, 'Post', 'authorId').writable, true);
    assert.deepEqual(field(schema, 'User', 'posts'), { name: 'posts', kind: 'relation', model: 'Post', list: true, nullable: false });
    assert.equal(field(schema, 'Post', 'author').model, 'User');
  });
  test(`Prisma ${version}: unsupported fields are preserved but cannot be granted`, () => {
    const raw = fixture(version);
    raw.datamodel.models[0].fields.push({ ...raw.datamodel.models[0].fields[2], name: 'locationValue', kind: 'unsupported', type: 'geography(Point,4326)' });
    const schema = normalizeDmmf(raw);
    assert.equal(field(schema, 'User', 'locationValue').kind, 'unsupported');
    const capabilities = { version: 1, operations: ['findMany'], maxRelationDepth: 0, pagination: { max: 10, allowSkip: false }, sources: [],
      models: [{ model: 'User', select: ['locationValue'], where: [], unique: [], orderBy: [], create: [], update: [], relations: [], forced: [] }] };
    assert.throws(() => readCapabilities(capabilities, schema), /supported scalar or enum/);
  });
  test(`Prisma ${version}: named compound primary key overrides joined default`, () => {
    const raw = fixture(version);
    raw.datamodel.models[1].primaryKey.name = 'postIdentity';
    assert.ok(model(normalizeDmmf(raw), 'Post').uniqueSelectors.some(selector => selector.name === 'postIdentity'));
  });
}

test('6.19.3 and 7.3.0 contract fixtures normalize to the same schema', () => assert.deepEqual(normalizeDmmf(fixture('6.19.3')), normalizeDmmf(fixture('7.3.0'))));

const cases = [
  ['unknown field kind', raw => { raw.datamodel.models[0].fields[0].kind = 'future'; }],
  ['unknown scalar type', raw => { raw.datamodel.models[0].fields[0].type = 'Money'; }],
  ['stale relation', raw => { raw.datamodel.models[0].fields.at(-1).type = 'Missing'; }],
  ['missing enum', raw => { raw.datamodel.enums = []; }],
  ['duplicate model', raw => { raw.datamodel.models.push(raw.datamodel.models[0]); }],
  ['duplicate field', raw => { raw.datamodel.models[0].fields.push(raw.datamodel.models[0].fields[0]); }],
  ['duplicate enum value', raw => { raw.datamodel.enums[0].values.push(raw.datamodel.enums[0].values[0]); }],
  ['stale selector field', raw => { raw.datamodel.models[1].primaryKey.fields = ['missing']; }],
  ['partial metadata', raw => { delete raw.datamodel.models[0].fields[0].isRequired; }],
  ['nonboolean metadata', raw => { raw.datamodel.models[0].fields[0].isId = 1; }],
  ['duplicate uniqueFields', raw => { raw.datamodel.models[1].uniqueFields.push(raw.datamodel.models[1].uniqueFields[0]); }],
  ['duplicate uniqueIndexes', raw => { raw.datamodel.models[1].uniqueIndexes.push(raw.datamodel.models[1].uniqueIndexes[0]); }],
  ['unique name collision', raw => { raw.datamodel.models[1].uniqueIndexes[0].name = 'tenantId_slug'; }],
  ['duplicate fields within selector', raw => { raw.datamodel.models[1].primaryKey.fields = ['slug', 'slug']; }],
  ['object defaults containing code', raw => { raw.datamodel.models[0].fields[0].default = () => 1; }],
  ['missing primaryKey metadata', raw => { delete raw.datamodel.models[0].primaryKey; }],
];
for (const [name, mutate] of cases) {
  test(`DMMF refusal: ${name}`, () => { const raw = fixture('6.19.3'); mutate(raw); assert.throws(() => normalizeDmmf(raw)); });
}

test('adapter ignores irrelevant schema/runtime wrappers without evaluating them', () => {
  const raw = fixture('6.19.3');
  let accessed = false;
  Object.defineProperty(raw, 'schema', { get() { accessed = true; throw new Error('runtime access'); } });
  assert.equal(normalizeDmmf(raw).models.length, 2);
  assert.equal(accessed, false);
});

test('adapter refuses datamodel getters without evaluating them', () => {
  let accessed = false;
  const raw = Object.defineProperty({}, 'datamodel', { get() { accessed = true; return {}; } });
  assert.throws(() => normalizeDmmf(raw), /data-only/);
  assert.equal(accessed, false);
});
