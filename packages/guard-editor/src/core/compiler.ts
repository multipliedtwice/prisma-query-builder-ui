import type { ForcedValue, GuardPolicy, JsonValue, Operation, Pagination, PolicyContext, Selection, SourceResolver, SourceRequest, WhereRule } from './types.js';
import { canonicalJson, refuse } from './json.js';
import { isUnique, readPolicy, validateLiteral } from './policy.js';
import { fieldFor, modelFor, readSchema, valueField } from './schema.js';

export const FORCED_MARKER = Symbol.for('prisma-guard.forced');
export interface ForcedGuardValue { value: JsonValue; [FORCED_MARKER]: true }
export interface WhereShape { [key: string]: true | ForcedGuardValue | WhereShape }
export interface NestedProjection { select: ProjectionShape; take?: Pagination }
export interface ProjectionShape { [key: string]: true | NestedProjection }
export interface GuardShapeData {
  select: ProjectionShape;
  where?: WhereShape;
  orderBy?: Record<string, true>;
  data?: Record<string, true | ForcedGuardValue>;
  skip?: true;
  take?: Pagination;
}
export type CompiledPolicy =
  | { enabled: false; model: string; operation: Operation }
  | { enabled: true; model: string; operation: Operation; shape: GuardShapeData; requirements: { enforceProjection: true } };

function force(value: JsonValue): ForcedGuardValue { return { value, [FORCED_MARKER]: true }; }

export function compilePolicy(input: unknown, context: PolicyContext, resolver?: SourceResolver): CompiledPolicy {
  const policy = readPolicy(input, context);
  const schema = readSchema(context.schema);
  if (!policy.enabled) return { enabled: false, model: policy.model, operation: policy.operation };
  function resolve(node: ForcedValue, request: Omit<SourceRequest, 'source'>): ForcedGuardValue {
    let value: JsonValue;
    if (node.kind === 'literal') value = node.value;
    else {
      if (!resolver) refuse('$compile', 'unresolved_source', 'Named forced sources require a consumer resolver');
      try { value = resolver(Object.freeze({ ...request, source: node.name })); }
      catch { refuse('$compile', 'source_failure', 'The consumer could not resolve a named forced source'); }
    }
    const field = valueField(fieldFor(modelFor(schema, request.model), request.field, '$compile'), '$compile');
    return force(validateLiteral(value, field, '$compile'));
  }
  function selection(entries: Selection[]): ProjectionShape {
    return Object.fromEntries(entries.map(entry => [entry.field, entry.kind === 'field' ? true : {
      select: selection(entry.select), ...(entry.take === null ? {} : { take: { ...entry.take } }),
    }]));
  }
  function where(rules: WhereRule[], modelName: string, unique = false): WhereShape {
    const result: WhereShape = {};
    const model = modelFor(schema, modelName);
    for (const rule of rules) {
      const field = fieldFor(model, rule.field, '$compile');
      if (rule.kind === 'relation') {
        if (field.kind !== 'relation') refuse('$compile', 'relation', 'Expected a relation descriptor');
        result[rule.field] = Object.fromEntries(rule.branches.map(branch => [branch.operator, where(branch.where, field.model)]));
      } else if (rule.kind === 'forced' && unique) {
        result[rule.field] = resolve(rule.value, { model: modelName, field: rule.field, target: 'where' });
      } else {
        const operators: WhereShape = rule.kind === 'forced'
          ? { equals: resolve(rule.value, { model: modelName, field: rule.field, target: 'where' }) }
          : Object.fromEntries(rule.operators.map(operator => [operator, true]));
        if (field.kind === 'scalar' && field.type === 'String' && !field.list && ['equals', 'contains', 'startsWith', 'endsWith'].some(operator => Object.hasOwn(operators, operator))) {
          operators.mode = force('default');
        }
        result[rule.field] = operators;
      }
    }
    return result;
  }
  const shape: GuardShapeData = { select: selection(policy.select) };
  const filters = where(policy.where, policy.model, isUnique(policy.operation));
  const model = modelFor(schema, policy.model);
  for (const selectorName of policy.unique) {
    const selector = model.uniqueSelectors.find(entry => entry.name === selectorName);
    if (!selector) refuse('$compile', 'unique', 'Unknown unique selector');
    filters[selectorName] = selector.fields.length === 1 ? true : Object.fromEntries(selector.fields.map(field => [field, true]));
  }
  if (Object.keys(filters).length) shape.where = filters;
  if (policy.orderBy.length) shape.orderBy = Object.fromEntries(policy.orderBy.map(field => [field, true]));
  if (policy.skip) shape.skip = true;
  if (policy.take !== null) shape.take = { ...policy.take };
  if (policy.data.length) {
    const target = policy.operation;
    if (target !== 'create' && target !== 'update') refuse('$compile', 'operation', 'Data requires a write operation');
    shape.data = Object.fromEntries(policy.data.map(rule => [rule.field, rule.kind === 'client' ? true : resolve(rule.value, { model: policy.model, field: rule.field, target })]));
  }
  return { enabled: true, model: policy.model, operation: policy.operation, shape, requirements: { enforceProjection: true } };
}

export function previewCompiledPolicy(compiled: CompiledPolicy): string {
  function display(value: unknown): JsonValue {
    if (value !== null && typeof value === 'object') {
      if (FORCED_MARKER in value && value[FORCED_MARKER] === true && 'value' in value) return { $force: display(value.value) };
      if (Array.isArray(value)) return value.map(display);
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, display(entry)]));
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
    return refuse('$preview', 'json', 'Unexpected compiled value');
  }
  return canonicalJson(display(compiled));
}

export function policyHasNamedSources(policy: GuardPolicy): boolean {
  const where = (rules: WhereRule[]): boolean => rules.some(rule =>
    rule.kind === 'forced' ? rule.value.kind === 'source' : rule.kind === 'relation' && rule.branches.some(branch => where(branch.where)));
  return where(policy.where) || policy.data.some(rule => rule.kind === 'forced' && rule.value.kind === 'source');
}
