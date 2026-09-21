import { SCALAR_TYPES, type FieldDescriptor, type ModelDescriptor, type Operator, type SchemaDescriptor, type ValueField } from './types.js';
import { array, bool, distinct, enumeration, integer, keys, name, names, readJsonValue, record, refuse, sorted } from './json.js';

const RESERVED_FIELDS = new Set(['AND', 'OR', 'NOT', '_count']);

function fieldName(input: unknown, path: string): string {
  const value = name(input, path);
  if (RESERVED_FIELDS.has(value)) refuse(path, 'reserved_field', `${value} conflicts with guard control syntax`);
  return value;
}

export function valueField(field: FieldDescriptor, path: string): ValueField {
  if (field.kind !== 'scalar' && field.kind !== 'enum') refuse(path, 'field_kind', 'Expected a supported scalar or enum field');
  return field;
}

export function modelFor(schema: SchemaDescriptor, model: string, path = '$.model'): ModelDescriptor {
  const found = schema.models.find(entry => entry.name === model);
  if (!found) refuse(path, 'stale_model', `Unknown model: ${model}`);
  return found;
}

export function fieldFor(model: ModelDescriptor, field: string, path: string): FieldDescriptor {
  const found = model.fields.find(entry => entry.name === field);
  if (!found) refuse(path, 'stale_field', `Unknown field: ${model.name}.${field}`);
  return found;
}

export function operatorsFor(field: FieldDescriptor): Operator[] {
  if (field.kind !== 'scalar' && field.kind !== 'enum') return [];
  if (field.kind === 'scalar' && field.type === 'Bytes') return [];
  if (field.list) return ['equals', 'has', 'hasSome', 'hasEvery', 'isEmpty'];
  if (field.kind === 'enum') return ['equals', 'in', 'notIn'];
  if (field.type === 'Boolean' || field.type === 'Json') return ['equals'];
  const comparable: Operator[] = ['equals', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte'];
  return field.type === 'String' ? [...comparable, 'contains', 'startsWith', 'endsWith'] : comparable;
}

export function canOrder(field: FieldDescriptor): boolean {
  return (field.kind === 'scalar' || field.kind === 'enum') && !field.list && field.type !== 'Json' && field.type !== 'Bytes';
}

export function readSchema(input: unknown): SchemaDescriptor {
  const raw = record(readJsonValue(input), '$schema');
  keys(raw, ['version', 'models'], '$schema');
  integer(raw.version, 1, 1, '$schema.version');
  const models = distinct(array(raw.models, '$schema.models', (value, path): ModelDescriptor => {
    const model = record(value, path);
    keys(model, ['name', 'fields', 'uniqueSelectors'], path);
    const fields = distinct(array(model.fields, `${path}.fields`, (value, path): FieldDescriptor => {
      const field = record(value, path);
      const kind = enumeration(field.kind, ['scalar', 'enum', 'relation', 'unsupported'], `${path}.kind`);
      const base = { name: fieldName(field.name, `${path}.name`), list: bool(field.list, `${path}.list`), nullable: bool(field.nullable, `${path}.nullable`) };
      if (base.list && base.nullable) refuse(path, 'field_shape', 'Nullable lists are not supported by this descriptor');
      if (kind === 'relation') {
        keys(field, ['name', 'kind', 'model', 'list', 'nullable'], path);
        return { ...base, kind, model: name(field.model, `${path}.model`) };
      }
      if (kind === 'unsupported') {
        keys(field, ['name', 'kind', 'type', 'list', 'nullable'], path);
        if (typeof field.type !== 'string' || field.type.length === 0) refuse(`${path}.type`, 'string', 'Unsupported type name is required');
        return { ...base, kind, type: field.type };
      }
      keys(field, ['name', 'kind', 'type', 'list', 'nullable', 'writable', 'hasDefault', ...(kind === 'enum' ? ['values'] : [])], path);
      const shared = { ...base, writable: bool(field.writable, `${path}.writable`), hasDefault: bool(field.hasDefault, `${path}.hasDefault`) };
      if (kind === 'scalar') return { ...shared, kind, type: enumeration(field.type, SCALAR_TYPES, `${path}.type`) };
      const values = names(field.values, `${path}.values`);
      if (!values.length) refuse(`${path}.values`, 'empty', 'An enum must have values');
      return { ...shared, kind, type: name(field.type, `${path}.type`), values: sorted(values, entry => entry) };
    }), field => field.name, `${path}.fields`);
    if (!fields.length) refuse(`${path}.fields`, 'empty', 'A model must have fields');
    const uniqueSelectors = distinct(array(model.uniqueSelectors, `${path}.uniqueSelectors`, (value, path) => {
      const selector = record(value, path);
      keys(selector, ['name', 'fields'], path);
      const selectorFields = names(selector.fields, `${path}.fields`);
      if (!selectorFields.length) refuse(path, 'empty', 'A unique selector must have fields');
      for (const fieldName of selectorFields) {
        const field = fields.find(field => field.name === fieldName);
        if (!field || !canOrder(field)) refuse(path, 'unique', `Invalid unique field: ${fieldName}`);
        if (selectorFields.length > 1 && field.nullable) refuse(path, 'unique', 'Compound unique fields cannot be nullable');
      }
      const selectorName = fieldName(selector.name, `${path}.name`);
      if (selectorFields.length === 1 && selectorName !== selectorFields[0]) refuse(path, 'unique', 'A single-field selector must use its field name');
      if (selectorFields.length > 1 && fields.some(field => field.name === selectorName)) refuse(path, 'unique', 'Compound selector collides with a field name');
      return { name: selectorName, fields: selectorFields };
    }), selector => selector.name, `${path}.uniqueSelectors`);
    distinct(uniqueSelectors, selector => selector.fields.join('\0'), `${path}.uniqueSelectors`);
    return { name: name(model.name, `${path}.name`), fields: sorted(fields, field => field.name), uniqueSelectors: sorted(uniqueSelectors, selector => selector.name) };
  }), model => model.name, '$schema.models');
  const schema: SchemaDescriptor = { version: 1, models: sorted(models, model => model.name) };
  for (const model of models) for (const field of model.fields) {
    if (field.kind === 'relation') modelFor(schema, field.model, `$schema.${model.name}.${field.name}`);
  }
  return schema;
}
