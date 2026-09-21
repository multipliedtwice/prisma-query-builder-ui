import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDmmf } from '../../dist/adapters/dmmf.js';

const models = `
enum State {
  ACTIVE
  INACTIVE
}
model User {
  id Int @id @default(autoincrement())
  email String @unique
  displayName String?
  state State @default(ACTIVE)
  tags String[]
  updatedAt DateTime @updatedAt
  posts Post[]
}
model Post {
  tenantId String
  slug String
  authorId Int
  title String
  author User @relation(fields: [authorId], references: [id])
  @@id([tenantId, slug])
  @@unique([authorId, slug], name: "authorSlug")
}
`;

for (const [version, moduleName, datasource] of [
  ['6.19.3', 'prisma-six-internals', 'datasource db {\n provider = "postgresql"\n url = "postgresql://localhost/guard_contract"\n}'],
  ['7.3.0', 'prisma-seven-internals', 'datasource db {\n provider = "postgresql"\n}'],
]) {
  test(`generation-backed Prisma ${version} descriptor contract without connecting to a database`, async () => {
    const imported = await import(moduleName);
    const getDMMF = imported.getDMMF ?? imported.default?.getDMMF;
    assert.equal(typeof getDMMF, 'function');
    const dmmf = await getDMMF({ datamodel: `${datasource}\n${models}` });
    const schema = normalizeDmmf(dmmf);
    const user = schema.models.find(model => model.name === 'User');
    const post = schema.models.find(model => model.name === 'Post');
    assert.deepEqual(user.uniqueSelectors, [{ name: 'email', fields: ['email'] }, { name: 'id', fields: ['id'] }]);
    assert.deepEqual(post.uniqueSelectors, [{ name: 'authorSlug', fields: ['authorId', 'slug'] }, { name: 'tenantId_slug', fields: ['tenantId', 'slug'] }]);
    assert.equal(user.fields.find(field => field.name === 'updatedAt').writable, false);
    assert.equal(user.fields.find(field => field.name === 'posts').model, 'Post');
    assert.equal(user.fields.find(field => field.name === 'tags').list, true);
    assert.deepEqual(user.fields.find(field => field.name === 'state').values, ['ACTIVE', 'INACTIVE']);
  });
}
