import { FORCE_TARGETS, OPERATIONS, OPERATORS, RELATION_OPERATORS, type Capabilities, type ModelCapability, type SchemaDescriptor } from './types.js';
import { array, bool, distinct, enumeration, integer, keys, name, names, readJsonValue, record, refuse, sorted, text } from './json.js';
import { canOrder, fieldFor, modelFor, operatorsFor, readSchema, valueField } from './schema.js';

export const MAX_RELATION_DEPTH = 5;
export const MAX_PAGE_SIZE = 10000;

export function capabilityFor(capabilities: Capabilities, model: string, path = '$capabilities.models'): ModelCapability {
  const found = capabilities.models.find(entry => entry.model === model);
  if (!found) refuse(path, 'capability', `Model is not exposed: ${model}`);
  return found;
}

export function readCapabilities(input: unknown, schemaInput: SchemaDescriptor): Capabilities {
  const schema = readSchema(schemaInput);
  const raw = record(readJsonValue(input), '$capabilities');
  keys(raw, ['version', 'operations', 'models', 'maxRelationDepth', 'pagination', 'sources'], '$capabilities');
  integer(raw.version, 1, 1, '$capabilities.version');
  const operations = distinct(array(raw.operations, '$capabilities.operations', (value, path) => enumeration(value, OPERATIONS, path)), entry => entry, '$capabilities.operations');
  const maxRelationDepth = integer(raw.maxRelationDepth, 0, MAX_RELATION_DEPTH, '$capabilities.maxRelationDepth');
  const paginationRaw = record(raw.pagination, '$capabilities.pagination');
  keys(paginationRaw, ['max', 'allowSkip'], '$capabilities.pagination');
  const pagination = { max: integer(paginationRaw.max, 1, MAX_PAGE_SIZE, '$capabilities.pagination.max'), allowSkip: bool(paginationRaw.allowSkip, '$capabilities.pagination.allowSkip') };
  const sources = distinct(array(raw.sources, '$capabilities.sources', (value, path) => {
    const source = record(value, path);
    keys(source, ['name', 'label'], path);
    const label = text(source.label, `${path}.label`);
    if (label.trim().length === 0) refuse(`${path}.label`, 'label', 'A visible consumer source label is required');
    return { name: name(source.name, `${path}.name`), label };
  }), source => source.name, '$capabilities.sources');
  const models = distinct(array(raw.models, '$capabilities.models', (value, path): ModelCapability => {
    const cap = record(value, path);
    keys(cap, ['model', 'select', 'where', 'unique', 'orderBy', 'create', 'update', 'relations', 'forced'], path);
    const modelName = name(cap.model, `${path}.model`);
    const model = modelFor(schema, modelName, `${path}.model`);
    const select = names(cap.select, `${path}.select`);
    for (const field of select) valueField(fieldFor(model, field, `${path}.select`), `${path}.select`);
    const where = distinct(array(cap.where, `${path}.where`, (value, path) => {
      const filter = record(value, path);
      keys(filter, ['field', 'operators'], path);
      const field = name(filter.field, `${path}.field`);
      const descriptor = fieldFor(model, field, path);
      const allowed = operatorsFor(descriptor);
      const operators = distinct(array(filter.operators, `${path}.operators`, (value, path) => enumeration(value, OPERATORS, path)), entry => entry, `${path}.operators`);
      if (!operators.length) refuse(path, 'empty', 'A filter capability must expose at least one operator');
      for (const operator of operators) if (!allowed.includes(operator)) refuse(path, 'operator', `${operator} is incompatible with ${modelName}.${field}`);
      return { field, operators: sorted(operators, entry => entry) };
    }), filter => filter.field, `${path}.where`);
    const unique = names(cap.unique, `${path}.unique`);
    for (const selector of unique) if (!model.uniqueSelectors.some(entry => entry.name === selector)) refuse(path, 'unique', `Unknown unique selector: ${selector}`);
    const orderBy = names(cap.orderBy, `${path}.orderBy`);
    for (const field of orderBy) if (!canOrder(fieldFor(model, field, path))) refuse(path, 'order', `Cannot order by ${field}`);
    function writable(key: 'create' | 'update'): string[] {
      const fields = names(cap[key], `${path}.${key}`);
      for (const field of fields) if (!valueField(fieldFor(model, field, path), path).writable) refuse(path, 'readonly_field', `${field} is not writable`);
      return sorted(fields, entry => entry);
    }
    const relations = distinct(array(cap.relations, `${path}.relations`, (value, path) => {
      const relation = record(value, path);
      keys(relation, ['field', 'select', 'where'], path);
      const field = name(relation.field, `${path}.field`);
      const descriptor = fieldFor(model, field, path);
      if (descriptor.kind !== 'relation') refuse(path, 'relation', `${field} is not a relation`);
      if (maxRelationDepth === 0) refuse(path, 'relation_depth', 'Relation traversal is disabled');
      const select = bool(relation.select, `${path}.select`);
      const where = distinct(array(relation.where, `${path}.where`, (value, path) => enumeration(value, RELATION_OPERATORS, path)), entry => entry, path);
      const allowed = descriptor.list ? ['some', 'every', 'none'] : ['is', 'isNot'];
      for (const operator of where) if (!allowed.includes(operator)) refuse(path, 'operator', `${operator} is incompatible with ${field}`);
      if (!select && !where.length) refuse(path, 'empty', 'A relation capability must expose selection or filtering');
      return { field, select, where: sorted(where, entry => entry) };
    }), entry => entry.field, `${path}.relations`);
    const forced = distinct(array(cap.forced, `${path}.forced`, (value, path) => {
      const grant = record(value, path);
      keys(grant, ['field', 'targets', 'literals', 'sources'], path);
      const field = name(grant.field, `${path}.field`);
      const descriptor = valueField(fieldFor(model, field, path), path);
      if (descriptor.type === 'Bytes') refuse(path, 'forced_type', 'Bytes forced values are outside the JSON subset');
      const targets = distinct(array(grant.targets, `${path}.targets`, (value, path) => enumeration(value, FORCE_TARGETS, path)), entry => entry, path);
      if (!targets.length) refuse(path, 'empty', 'A forced capability must expose a target');
      if (targets.some(target => target !== 'where') && !descriptor.writable) refuse(path, 'readonly_field', `${field} is not writable`);
      const literals = bool(grant.literals, `${path}.literals`);
      const sourceNames = names(grant.sources, `${path}.sources`);
      for (const source of sourceNames) if (!sources.some(entry => entry.name === source)) refuse(path, 'source', `Unknown named source: ${source}`);
      if (!literals && !sourceNames.length) refuse(path, 'empty', 'A forced capability must expose literals or named sources');
      return { field, targets: sorted(targets, entry => entry), literals, sources: sorted(sourceNames, entry => entry) };
    }), entry => entry.field, `${path}.forced`);
    return { model: modelName, select: sorted(select, entry => entry), where: sorted(where, entry => entry.field), unique: sorted(unique, entry => entry), orderBy: sorted(orderBy, entry => entry), create: writable('create'), update: writable('update'), relations: sorted(relations, entry => entry.field), forced: sorted(forced, entry => entry.field) };
  }), entry => entry.model, '$capabilities.models');
  const capabilities: Capabilities = { version: 1, operations: sorted(operations, entry => entry), models: sorted(models, entry => entry.model), maxRelationDepth, pagination, sources: sorted(sources, entry => entry.name) };
  for (const model of models) for (const relation of model.relations) {
    const field = fieldFor(modelFor(schema, model.model), relation.field, '$capabilities.models');
    if (field.kind === 'relation') capabilityFor(capabilities, field.model);
  }
  return capabilities;
}
