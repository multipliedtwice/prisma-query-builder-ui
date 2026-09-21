import { OPERATIONS, operatorsFor, readSchema, readCapabilities, readPolicy } from '../../dist/index.js';

const scalar = (name, type, options = {}) => ({ name, kind: 'scalar', type, list: false, nullable: false, writable: true, hasDefault: false, ...options });
export const schema = readSchema({ version: 1, models: [
  { name: 'User', fields: [
    scalar('id', 'Int', { hasDefault: true }), scalar('email', 'String'), scalar('name', 'String', { nullable: true }),
    scalar('active', 'Boolean', { hasDefault: true }), scalar('score', 'Float', { nullable: true }),
    scalar('amount', 'Decimal', { nullable: true }), scalar('total', 'BigInt', { hasDefault: true }),
    scalar('born', 'DateTime', { nullable: true }), scalar('meta', 'Json', { nullable: true }), scalar('bytes', 'Bytes', { nullable: true }),
    scalar('tags', 'String', { list: true, hasDefault: true }), scalar('tenantId', 'String'),
    scalar('updatedAt', 'DateTime', { writable: false, hasDefault: true }),
    { ...scalar('status', 'Status', { hasDefault: true }), kind: 'enum', values: ['ACTIVE', 'INACTIVE'] },
    { name: 'posts', kind: 'relation', model: 'Post', list: true, nullable: false },
    { name: 'manager', kind: 'relation', model: 'User', list: false, nullable: true },
  ], uniqueSelectors: [{ name: 'id', fields: ['id'] }, { name: 'email', fields: ['email'] }] },
  { name: 'Post', fields: [scalar('id', 'Int', { hasDefault: true }), scalar('title', 'String'), scalar('slug', 'String'),
    scalar('tenantId', 'String'), scalar('authorId', 'Int'), scalar('published', 'Boolean', { hasDefault: true }),
    { name: 'author', kind: 'relation', model: 'User', list: false, nullable: false },
  ], uniqueSelectors: [{ name: 'id', fields: ['id'] }, { name: 'slugScope', fields: ['tenantId', 'slug'] }] },
] });
export const capabilities = readCapabilities({ version: 1, operations: [...OPERATIONS],
  maxRelationDepth: 2, pagination: { max: 100, allowSkip: true }, sources: [{ name: 'actorTenant', label: 'Current tenant' }],
  models: schema.models.map(model => ({
    model: model.name,
    select: model.fields.filter(field => field.kind === 'scalar' || field.kind === 'enum').map(field => field.name),
    where: model.fields.filter(field => operatorsFor(field).length).map(field => ({ field: field.name, operators: operatorsFor(field) })),
    unique: model.uniqueSelectors.map(selector => selector.name),
    orderBy: model.fields.filter(field => (field.kind === 'scalar' || field.kind === 'enum') && !field.list && !['Json', 'Bytes'].includes(field.type)).map(field => field.name),
    create: model.fields.filter(field => (field.kind === 'scalar' || field.kind === 'enum') && field.writable).map(field => field.name),
    update: model.fields.filter(field => (field.kind === 'scalar' || field.kind === 'enum') && field.writable).map(field => field.name),
    relations: model.fields.filter(field => field.kind === 'relation').map(field => ({ field: field.name, select: true, where: field.list ? ['some', 'every', 'none'] : ['is', 'isNot'] })),
    forced: model.fields.filter(field => (field.kind === 'scalar' || field.kind === 'enum') && field.type !== 'Bytes').map(field => ({
      field: field.name, targets: field.writable ? ['where', 'create', 'update'] : ['where'], literals: true,
      sources: field.name === 'tenantId' ? ['actorTenant'] : [],
    })),
  })),
}, schema);
export const context = { schema, capabilities };
export function freshContext() { return structuredClone(context); }
export function policy(operation = 'findMany', model = 'User') {
  return readPolicy({ version: 1, model, operation, enabled: true, select: [{ kind: 'field', field: 'id' }],
    where: [], unique: ['findUnique', 'update', 'delete'].includes(operation) ? ['id'] : [], orderBy: [],
    data: ['create', 'update'].includes(operation) ? [{ kind: 'client', field: model === 'User' ? 'email' : 'title' }] : [],
    skip: false, take: ['findMany', 'findManyPaginated'].includes(operation) ? { default: 25, max: 100 } : null,
  }, context);
}
export function disabledPolicy(operation = 'findMany', model = 'User') {
  return { version: 1, model, operation, enabled: false, select: [], where: [], unique: [], orderBy: [], data: [], skip: false, take: null };
}
