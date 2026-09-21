import { OPERATIONS, OPERATORS, RELATION_OPERATORS, type Capabilities, type DataRule, type ForceTarget, type ForcedValue, type GuardPolicy, type JsonValue, type ModelDescriptor, type Pagination, type PolicyContext, type SchemaDescriptor, type Selection, type ValidationResult, type ValueField, type WhereRule } from './types.js';
import { array, bool, distinct, enumeration, integer, keys, name, names, parseJson, readJsonValue, record, refuse, resultOf, sorted, canonicalJson } from './json.js';
import { fieldFor, modelFor, readSchema, valueField } from './schema.js';
import { capabilityFor, readCapabilities } from './capabilities.js';

export function isMany(operation: string): boolean { return operation === 'findMany' || operation === 'findManyPaginated'; }
export function isUnique(operation: string): boolean { return operation === 'findUnique' || operation === 'update' || operation === 'delete'; }

export function validateLiteral(input: unknown, field: ValueField, path: string): JsonValue {
  const value = readJsonValue(input);
  function scalar(value: JsonValue): void {
    if (field.kind === 'enum') {
      if (typeof value !== 'string' || !field.values.includes(value)) refuse(path, 'literal', 'Expected a declared enum value');
      return;
    }
    switch (field.type) {
      case 'String': if (typeof value !== 'string') refuse(path, 'literal', 'Expected a string'); return;
      case 'Boolean': if (typeof value !== 'boolean') refuse(path, 'literal', 'Expected a boolean'); return;
      case 'Int': integer(value, -2147483648, 2147483647, path); return;
      case 'Float': if (typeof value !== 'number') refuse(path, 'literal', 'Expected a finite JSON number'); return;
      case 'Decimal':
        if (typeof value !== 'number' && !(typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value))) refuse(path, 'literal', 'Expected a decimal number or decimal string');
        return;
      case 'BigInt':
        if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)$/.test(value) || value.length > 20 || BigInt(value) < -9223372036854775808n || BigInt(value) > 9223372036854775807n) refuse(path, 'literal', 'Expected a signed 64-bit integer encoded as a decimal string');
        return;
      case 'DateTime':
        if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) refuse(path, 'literal', 'Expected an exact UTC ISO timestamp, including milliseconds');
        return;
      case 'Json': if (value === null) refuse(path, 'literal', 'JSON null requires a consumer decision about database null versus JSON null'); return;
      case 'Bytes': refuse(path, 'literal', 'Bytes forced values are outside the JSON subset');
    }
  }
  if (value === null) {
    if (field.type === 'Json') refuse(path, 'literal', 'JSON null is ambiguous');
    if (!field.nullable || field.list) refuse(path, 'literal', 'This field does not allow null');
  } else if (field.list) {
    if (!Array.isArray(value)) refuse(path, 'literal', 'Expected an array');
    value.forEach(scalar);
  } else scalar(value);
  return value;
}

export function readPagination(input: unknown, capabilities: Capabilities, path: string): Pagination | null {
  if (input === null) return null;
  const raw = record(input, path);
  keys(raw, ['default', 'max'], path);
  const max = integer(raw.max, 1, capabilities.pagination.max, `${path}.max`);
  return { default: integer(raw.default, 1, max, `${path}.default`), max };
}

function readForced(input: unknown, model: ModelDescriptor, fieldName: string, target: ForceTarget, capabilities: Capabilities, path: string): ForcedValue {
  const raw = record(input, path);
  const kind = enumeration(raw.kind, ['literal', 'source'], `${path}.kind`);
  const field = valueField(fieldFor(model, fieldName, path), path);
  const grant = capabilityFor(capabilities, model.name).forced.find(entry => entry.field === fieldName && entry.targets.includes(target));
  if (!grant) refuse(path, 'capability', `Forced ${target} is not allowed for ${fieldName}`);
  if (kind === 'literal') {
    keys(raw, ['kind', 'value'], path);
    if (!grant.literals) refuse(path, 'capability', 'Literal values are not allowed here');
    return { kind, value: validateLiteral(raw.value, field, `${path}.value`) };
  }
  keys(raw, ['kind', 'name'], path);
  const source = name(raw.name, `${path}.name`);
  if (!grant.sources.includes(source)) refuse(path, 'source', 'The named source is not allowed for this field and target');
  return { kind, name: source };
}

function readSelection(input: unknown, schema: SchemaDescriptor, model: ModelDescriptor, capabilities: Capabilities, depth: number, path: string): Selection[] {
  const cap = capabilityFor(capabilities, model.name);
  const selection = distinct(array(input, path, (value, path): Selection => {
    const raw = record(value, path);
    const kind = enumeration(raw.kind, ['field', 'relation'], `${path}.kind`);
    const field = name(raw.field, `${path}.field`);
    const descriptor = fieldFor(model, field, path);
    if (kind === 'field') {
      keys(raw, ['kind', 'field'], path);
      valueField(descriptor, path);
      if (!cap.select.includes(field)) refuse(path, 'capability', `Projection is not allowed for ${field}`);
      return { kind, field };
    }
    keys(raw, ['kind', 'field', 'select', 'take'], path);
    if (descriptor.kind !== 'relation') refuse(path, 'relation', `${field} is not a relation`);
    if (depth >= capabilities.maxRelationDepth) refuse(path, 'relation_depth', 'Projection exceeds the supplied relation depth');
    if (!cap.relations.some(entry => entry.field === field && entry.select)) refuse(path, 'capability', `Relation projection is not allowed for ${field}`);
    const select = readSelection(raw.select, schema, modelFor(schema, descriptor.model), capabilities, depth + 1, `${path}.select`);
    if (!select.length) refuse(path, 'empty', 'A relation projection must select at least one field');
    const take = readPagination(raw.take, capabilities, `${path}.take`);
    if (descriptor.list && take === null) refuse(path, 'pagination', 'To-many projections require pagination bounds');
    if (!descriptor.list && take !== null) refuse(path, 'pagination', 'To-one projections do not accept pagination');
    return { kind, field, select, take };
  }), entry => entry.field, path);
  return sorted(selection, entry => entry.field);
}

function hasForced(rules: WhereRule[], schema: SchemaDescriptor, model: ModelDescriptor): boolean {
  return rules.some(rule => {
    const field = fieldFor(model, rule.field, '$.where');
    if (rule.kind === 'forced') return true;
    if (rule.kind === 'relation' && field.kind === 'relation') {
      return rule.branches.some(branch => hasForced(branch.where, schema, modelFor(schema, field.model)));
    }
    return rule.kind === 'scalar' && field.kind === 'scalar' && field.type === 'String' && !field.list &&
      rule.operators.some(operator => ['equals', 'contains', 'startsWith', 'endsWith'].includes(operator));
  });
}

function readWhere(input: unknown, schema: SchemaDescriptor, model: ModelDescriptor, capabilities: Capabilities, unique: boolean, depth: number, path: string): WhereRule[] {
  const cap = capabilityFor(capabilities, model.name);
  const rules = distinct(array(input, path, (value, path): WhereRule => {
    const raw = record(value, path);
    const kind = enumeration(raw.kind, ['scalar', 'forced', 'relation'], `${path}.kind`);
    const field = name(raw.field, `${path}.field`);
    const descriptor = fieldFor(model, field, path);
    if (kind === 'forced') {
      keys(raw, ['kind', 'field', 'value'], path);
      const scalar = valueField(descriptor, path);
      if (unique && (scalar.list || scalar.type === 'Json' || scalar.type === 'Bytes')) refuse(path, 'unique', 'Unique predicates require a direct scalar value');
      return { kind, field, value: readForced(raw.value, model, field, 'where', capabilities, `${path}.value`) };
    }
    if (unique) refuse(path, 'unique', 'Unique operations use direct unique selectors, not filter operators or relation filters');
    if (kind === 'scalar') {
      keys(raw, ['kind', 'field', 'operators'], path);
      valueField(descriptor, path);
      const allowed = cap.where.find(entry => entry.field === field)?.operators ?? [];
      const operators = distinct(array(raw.operators, `${path}.operators`, (value, path) => enumeration(value, OPERATORS, path)), entry => entry, path);
      if (!operators.length) refuse(path, 'empty', 'A filter must allow at least one operator');
      for (const operator of operators) if (!allowed.includes(operator)) refuse(path, 'capability', `${operator} is not allowed for ${field}`);
      return { kind, field, operators: sorted(operators, entry => entry) };
    }
    keys(raw, ['kind', 'field', 'branches'], path);
    if (descriptor.kind !== 'relation') refuse(path, 'relation', `${field} is not a relation`);
    if (depth >= capabilities.maxRelationDepth) refuse(path, 'relation_depth', 'Filter exceeds the supplied relation depth');
    const allowed = cap.relations.find(entry => entry.field === field)?.where ?? [];
    const branches = distinct(array(raw.branches, `${path}.branches`, (value, path) => {
      const branch = record(value, path);
      keys(branch, ['operator', 'where'], path);
      const operator = enumeration(branch.operator, RELATION_OPERATORS, `${path}.operator`);
      if (!allowed.includes(operator)) refuse(path, 'capability', `${operator} is not allowed for ${field}`);
      const where = readWhere(branch.where, schema, modelFor(schema, descriptor.model), capabilities, false, depth + 1, `${path}.where`);
      if (!where.length) refuse(path, 'empty', 'A relation filter must contain a rule');
      if ((operator === 'none' || operator === 'isNot') && hasForced(where, schema, modelFor(schema, descriptor.model))) refuse(path, 'negative_force', 'Negative relation filters cannot contain forced predicates or string operators requiring a forced default mode');
      return { operator, where };
    }), branch => branch.operator, `${path}.branches`);
    if (!branches.length) refuse(path, 'empty', 'A relation filter must contain a branch');
    return { kind, field, branches: sorted(branches, branch => branch.operator) };
  }), entry => entry.field, path);
  return sorted(rules, entry => entry.field);
}

export function readPolicy(input: unknown, context: PolicyContext): GuardPolicy {
  const schema = readSchema(context.schema);
  const capabilities = readCapabilities(context.capabilities, schema);
  const raw = record(readJsonValue(input), '$');
  keys(raw, ['version', 'model', 'operation', 'enabled', 'select', 'where', 'unique', 'orderBy', 'data', 'skip', 'take'], '$');
  integer(raw.version, 1, 1, '$.version');
  const modelName = name(raw.model, '$.model');
  const model = modelFor(schema, modelName);
  const cap = capabilityFor(capabilities, modelName);
  const operation = enumeration(raw.operation, OPERATIONS, '$.operation');
  if (!capabilities.operations.includes(operation)) refuse('$.operation', 'capability', 'Operation is not exposed');
  const enabled = bool(raw.enabled, '$.enabled');
  const select = readSelection(raw.select, schema, model, capabilities, 0, '$.select');
  const where = readWhere(raw.where, schema, model, capabilities, isUnique(operation), 0, '$.where');
  const unique = names(raw.unique, '$.unique');
  for (const selector of unique) {
    if (!cap.unique.includes(selector)) refuse('$.unique', 'unique', `Unique selector is not allowed: ${selector}`);
    const fields = model.uniqueSelectors.find(entry => entry.name === selector)?.fields ?? [];
    if (where.some(rule => fields.includes(rule.field))) refuse('$.where', 'conflict', `Forced predicate conflicts with client unique selector ${selector}`);
  }
  const orderBy = names(raw.orderBy, '$.orderBy');
  for (const field of orderBy) if (!cap.orderBy.includes(field)) refuse('$.orderBy', 'capability', `Ordering is not allowed for ${field}`);
  const data = distinct(array(raw.data, '$.data', (value, path): DataRule => {
    const rule = record(value, path);
    const kind = enumeration(rule.kind, ['client', 'forced'], `${path}.kind`);
    const field = name(rule.field, `${path}.field`);
    const descriptor = valueField(fieldFor(model, field, path), path);
    if (operation !== 'create' && operation !== 'update') refuse(path, 'operation', 'This operation has no writable data');
    if (!descriptor.writable) refuse(path, 'readonly_field', `${field} is not writable`);
    if (kind === 'client') {
      keys(rule, ['kind', 'field'], path);
      if (!cap[operation].includes(field)) refuse(path, 'capability', `Client data is not allowed for ${field}`);
      return { kind, field };
    }
    keys(rule, ['kind', 'field', 'value'], path);
    return { kind, field, value: readForced(rule.value, model, field, operation, capabilities, `${path}.value`) };
  }), entry => entry.field, '$.data');
  const skip = bool(raw.skip, '$.skip');
  const take = readPagination(raw.take, capabilities, '$.take');
  if (skip && !capabilities.pagination.allowSkip) refuse('$.skip', 'capability', 'Skip is not allowed');
  if (!isMany(operation) && (skip || take !== null || orderBy.length > 0)) refuse('$', 'operation', 'Pagination, skip and ordering are only supported for list operations');
  if (!isUnique(operation) && unique.length > 0) refuse('$.unique', 'operation', 'This operation does not accept unique selectors');
  if (operation === 'create' && where.length > 0) refuse('$.where', 'operation', 'Create does not accept filters');
  if (enabled) {
    if (!select.length) refuse('$.select', 'empty_enabled', 'An enabled policy requires an explicit return projection');
    if (isMany(operation) && take === null) refuse('$.take', 'pagination', 'An enabled list policy requires pagination bounds');
    if (isUnique(operation) && unique.length === 0) refuse('$.unique', 'empty_enabled', 'An enabled unique operation requires an allowed unique selector');
    if ((operation === 'create' || operation === 'update') && !data.length) refuse('$.data', 'empty_enabled', 'An enabled write requires client-controlled or forced data');
  }
  return { version: 1, model: modelName, operation, enabled, select, where, unique: sorted(unique, entry => entry), orderBy: sorted(orderBy, entry => entry), data: sorted(data, entry => entry.field), skip, take };
}

export function validatePolicy(input: unknown, context: PolicyContext): ValidationResult<GuardPolicy> { return resultOf(() => readPolicy(input, context)); }
export function parsePolicy(source: string, context: PolicyContext): GuardPolicy { return readPolicy(parseJson(source), context); }
export function serializePolicy(input: unknown, context: PolicyContext): string { return canonicalJson(readPolicy(input, context)); }
