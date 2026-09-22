import { modelFor, operatorsFor } from '../core/schema.js';
import { readTemplateContext } from '../templates/saved-query.js';
import type { FieldDescriptor, ValueField } from '../core/types.js';
import type { QueryOperation, TemplateContext } from '../templates/types.js';
import type { ArgDefinition, DmmfInputTypeRef, FieldDefinition, Operation, QuerySchema } from './types.js';

const ref = (type: string, inputLocation: string, isList = false): DmmfInputTypeRef => ({ type, location: inputLocation, isList });
function field(name: string, type: string, inputLocation = 'inputObjectTypes', list = false): FieldDefinition {
  return { name, type, isRelation: inputLocation === 'inputObjectTypes', isList: list,
    inputTypes: [ref(type, inputLocation, list)], objectTypeName: inputLocation === 'inputObjectTypes' ? type : null };
}
export function createQuerySchema(supplied: TemplateContext): QuerySchema & { operation(model: string, method: QueryOperation): Operation } {
  const context = readTemplateContext(supplied);
  const definitions = new Map<string, FieldDefinition[]>();
  const enums = new Map<string, string[]>([['SortOrder', ['asc', 'desc']], ['QueryMode', ['default', 'insensitive']]]);
  const value = (descriptor: ValueField, name = descriptor.name, list = descriptor.list) => field(name, descriptor.type, descriptor.kind === 'enum' ? 'enumTypes' : 'scalar', list);
  function filter(model: string, descriptor: ValueField): FieldDefinition {
    const name = `${model}_${descriptor.name}Filter`;
    const entries = operatorsFor(descriptor).map(operator => value(descriptor, operator, ['in', 'notIn', 'hasSome', 'hasEvery'].includes(operator) || (operator === 'equals' && descriptor.list)));
    for (const entry of entries) if (entry.name === 'isEmpty') Object.assign(entry, field(entry.name, 'Boolean', 'scalar'));
    if (descriptor.kind === 'scalar' && descriptor.type === 'String' && !descriptor.list) entries.push(field('mode', 'QueryMode', 'enumTypes'));
    definitions.set(name, entries);
    return field(descriptor.name, name);
  }
  for (const model of context.schema.models) {
    const scalars = model.fields.filter((item): item is ValueField => item.kind === 'scalar' || item.kind === 'enum');
    for (const descriptor of scalars) if (descriptor.kind === 'enum') enums.set(descriptor.type, descriptor.values);
    const relations = context.maxRelationDepth > 0 ? model.fields.filter(item => item.kind === 'relation') : [];
    const relationArgs = (descriptor: FieldDescriptor): FieldDefinition => {
      if (descriptor.kind !== 'relation') return field(descriptor.name, 'Boolean', 'scalar');
      const type = `${model.name}$${descriptor.name}Args`;
      const entries = [field('select', `${descriptor.model}Select`), field('include', `${descriptor.model}Include`)];
      if (descriptor.list) entries.push(field('where', `${descriptor.model}WhereInput`), field('orderBy', `${descriptor.model}OrderByInput`), field('take', 'Int', 'scalar'), field('skip', 'Int', 'scalar'));
      definitions.set(type, entries);
      return { ...field(descriptor.name, type), relationModel: descriptor.model };
    };
    definitions.set(`${model.name}Select`, [...scalars.map(item => field(item.name, 'Boolean', 'scalar')), ...relations.map(relationArgs)]);
    definitions.set(`${model.name}Include`, relations.map(relationArgs));
    const where: FieldDefinition[] = scalars.filter(item => !['Json', 'Bytes'].includes(item.type)).map(item => filter(model.name, item));
    for (const relation of relations) {
      if (relation.kind !== 'relation') continue;
      const type = `${model.name}_${relation.name}RelationFilter`;
      definitions.set(type, (relation.list ? ['some', 'every', 'none'] : ['is', 'isNot']).map(operator => field(operator, `${relation.model}WhereInput`)));
      where.push(field(relation.name, type));
    }
    where.push(...['AND', 'OR', 'NOT'].map(name => field(name, `${model.name}WhereInput`, 'inputObjectTypes', true)));
    definitions.set(`${model.name}WhereInput`, where);
    definitions.set(`${model.name}WhereUniqueInput`, model.uniqueSelectors.map(selector => {
      if (selector.fields.length === 1) return value(scalars.find(item => item.name === selector.fields[0])!);
      const type = `${model.name}_${selector.name}CompoundUniqueInput`;
      definitions.set(type, selector.fields.map(name => value(scalars.find(item => item.name === name)!)));
      return field(selector.name, type);
    }));
    definitions.set(`${model.name}OrderByInput`, [...scalars.filter(item => !item.list && !['Json', 'Bytes'].includes(item.type)).map(item => field(item.name, 'SortOrder', 'enumTypes')),
      ...relations.filter(item => item.kind === 'relation' && !item.list).map(item => field(item.name, `${item.kind === 'relation' ? item.model : ''}OrderByInput`))]);
    const data = scalars.filter(item => item.writable && item.type !== 'Bytes').map(item => value(item));
    for (const relation of relations) {
      if (relation.kind !== 'relation') continue;
      const type = `${model.name}_${relation.name}ConnectInput`;
      definitions.set(type, [field('connect', `${relation.model}WhereUniqueInput`, 'inputObjectTypes', relation.list)]);
      data.push(field(relation.name, type));
    }
    definitions.set(`${model.name}CreateInput`, data);
    definitions.set(`${model.name}UpdateInput`, data);
  }
  return { getInputTypeFields: name => definitions.get(name) ?? [], getEnumValues: name => enums.get(name) ?? [],
    operation(model, method) {
      modelFor(context.schema, model);
      const args: ArgDefinition[] = [];
      const add = (name: string, type: string, required = false, scalar = false) => args.push({ name, type, isRequired: required, isNullable: false,
        inputTypes: [ref(type, scalar ? 'scalar' : 'inputObjectTypes')], objectTypeName: scalar ? null : type });
      add('select', `${model}Select`); add('include', `${model}Include`);
      if (method !== 'create') add('where', `${model}${['findUnique', 'update', 'delete'].includes(method) ? 'WhereUniqueInput' : 'WhereInput'}`, ['findUnique', 'update', 'delete'].includes(method));
      if (['findMany', 'findFirst'].includes(method)) { add('orderBy', `${model}OrderByInput`); add('take', 'Int', false, true); add('skip', 'Int', false, true); }
      if (['create', 'update'].includes(method)) add('data', `${model}${method === 'create' ? 'CreateInput' : 'UpdateInput'}`, true);
      return { type: ['create', 'update', 'delete'].includes(method) ? 'write' : 'read', model, method, args };
    } };
}
