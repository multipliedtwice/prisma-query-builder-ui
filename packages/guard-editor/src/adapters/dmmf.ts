import type { FieldDescriptor, ModelDescriptor, SchemaDescriptor, UniqueSelector } from '../core/types.js';
import { SCALAR_TYPES } from '../core/types.js';
import { array, bool, distinct, enumeration, name, names, readJsonValue, record, refuse, text } from '../core/json.js';
import { readSchema } from '../core/schema.js';

export interface DmmfFieldLike {
  readonly name: string;
  readonly kind: string;
  readonly type: string;
  readonly isList: boolean;
  readonly isRequired: boolean;
  readonly isId: boolean;
  readonly isUnique: boolean;
  readonly hasDefaultValue: boolean;
  readonly isUpdatedAt?: boolean;
  readonly isGenerated?: boolean;
}
export interface DmmfModelLike {
  readonly name: string;
  readonly fields: readonly DmmfFieldLike[];
  readonly primaryKey: { readonly name: string | null; readonly fields: readonly string[] } | null;
  readonly uniqueFields: readonly (readonly string[])[];
  readonly uniqueIndexes: readonly { readonly name?: string | null; readonly fields: readonly string[] }[];
}
export interface DmmfDocumentLike {
  readonly datamodel: {
    readonly models: readonly DmmfModelLike[];
    readonly enums: readonly { readonly name: string; readonly values: readonly { readonly name: string }[] }[];
  };
}

export function normalizeDmmf(input: DmmfDocumentLike): SchemaDescriptor;
export function normalizeDmmf(input: unknown): SchemaDescriptor;
export function normalizeDmmf(input: unknown): SchemaDescriptor {
  const root = record(input, '$dmmf');
  const property = Object.getOwnPropertyDescriptor(root, 'datamodel');
  if (!property || !('value' in property)) refuse('$dmmf.datamodel', 'dmmf', 'A data-only datamodel property is required');
  const datamodel = record(readJsonValue(property.value), '$dmmf.datamodel');
  const enums = distinct(array(datamodel.enums, '$dmmf.datamodel.enums', (value, path) => {
    const raw = record(value, path);
    const values = distinct(array(raw.values, `${path}.values`, (value, path) => name(record(value, path).name, `${path}.name`)), entry => entry, path);
    if (!values.length) refuse(path, 'empty', 'Enum values are required');
    return { name: name(raw.name, `${path}.name`), values };
  }), entry => entry.name, '$dmmf.datamodel.enums');
  const models = array(datamodel.models, '$dmmf.datamodel.models', (value, path): ModelDescriptor => {
    const raw = record(value, path);
    const rawFields = array(raw.fields, `${path}.fields`, record);
    const fields = rawFields.map((field, index): FieldDescriptor => {
      const fieldPath = `${path}.fields[${index}]`;
      const kind = enumeration(field.kind, ['scalar', 'enum', 'object', 'unsupported'], `${fieldPath}.kind`);
      const base = { name: name(field.name, `${fieldPath}.name`), list: bool(field.isList, `${fieldPath}.isList`), nullable: !bool(field.isRequired, `${fieldPath}.isRequired`) };
      if (kind === 'object') return { ...base, kind: 'relation', model: name(field.type, `${fieldPath}.type`) };
      if (kind === 'unsupported') return { ...base, kind, type: text(field.type, `${fieldPath}.type`) };
      const updated = field.isUpdatedAt === undefined ? false : bool(field.isUpdatedAt, `${fieldPath}.isUpdatedAt`);
      const generated = field.isGenerated === undefined ? false : bool(field.isGenerated, `${fieldPath}.isGenerated`);
      const shared = { ...base, writable: !updated && !generated, hasDefault: bool(field.hasDefaultValue, `${fieldPath}.hasDefaultValue`) };
      if (kind === 'scalar') return { ...shared, kind, type: enumeration(field.type, SCALAR_TYPES, `${fieldPath}.type`) };
      const type = name(field.type, `${fieldPath}.type`);
      const found = enums.find(entry => entry.name === type);
      if (!found) refuse(fieldPath, 'enum', `Unknown enum: ${type}`);
      return { ...shared, kind, type, values: [...found.values] };
    });
    const selectors: UniqueSelector[] = [];
    function add(fields: string[], explicitName: unknown, path: string, redundant = false): void {
      if (!fields.length) refuse(path, 'unique', 'A unique constraint requires fields');
      const selectorName = fields.length === 1 ? fields[0] : explicitName === null || explicitName === undefined ? fields.join('_') : name(explicitName, path);
      const sameName = selectors.find(selector => selector.name === selectorName);
      const sameFields = selectors.find(selector => selector.fields.join('\0') === fields.join('\0'));
      if (sameName && sameName.fields.join('\0') !== fields.join('\0')) refuse(path, 'unique', 'Unique selector name collision');
      if (sameFields) {
        if (!redundant && sameFields.name !== selectorName) refuse(path, 'unique', 'Conflicting names for the same unique fields');
        return;
      }
      selectors.push({ name: selectorName, fields });
    }
    rawFields.forEach((field, index) => {
      const fieldPath = `${path}.fields[${index}]`;
      const isId = bool(field.isId, `${fieldPath}.isId`);
      const isUnique = bool(field.isUnique, `${fieldPath}.isUnique`);
      if (isId || isUnique) add([name(field.name, `${fieldPath}.name`)], null, fieldPath);
    });
    if (raw.primaryKey !== null) {
      const primary = record(raw.primaryKey, `${path}.primaryKey`);
      add(names(primary.fields, `${path}.primaryKey.fields`), primary.name, `${path}.primaryKey`);
    }
    const indexes = distinct(array(raw.uniqueIndexes, `${path}.uniqueIndexes`, (value, path) => {
      const index = record(value, path);
      return { fields: names(index.fields, `${path}.fields`), name: index.name };
    }), index => index.fields.join('\0'), `${path}.uniqueIndexes`);
    indexes.forEach(index => add(index.fields, index.name, `${path}.uniqueIndexes`));
    const uniqueFields = distinct(array(raw.uniqueFields, `${path}.uniqueFields`, names), fields => fields.join('\0'), `${path}.uniqueFields`);
    uniqueFields.forEach(fields => add(fields, null, `${path}.uniqueFields`, true));
    return { name: name(raw.name, `${path}.name`), fields, uniqueSelectors: selectors };
  });
  return readSchema({ version: 1, models });
}
