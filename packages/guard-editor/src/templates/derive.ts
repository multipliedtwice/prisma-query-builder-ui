import { bool, canonicalJson, enumeration, integer, keys, parseJson, readJsonValue, record, refuse, resultOf, sorted, text } from '../core/json.js';
import { FORCED_MARKER, type ForcedGuardValue } from '../core/compiler.js';
import { fieldFor, modelFor, operatorsFor, valueField, canOrder, usesForcedStringMode } from '../core/schema.js';
import { validateLiteral } from '../core/policy.js';
import type { ForcedValue, JsonValue, ModelDescriptor, ValueField } from '../core/types.js';
import { isPlainObject } from '../query/payload.js';
import type { Payload, PayloadValue } from '../query/types.js';
import { readSavedQuery, readTemplateContext, sameSchema } from './saved-query.js';
import type { DerivedTemplate, SavedQueryTemplate, ShapeNode, TemplateContext, TemplateGuardShape, TemplateInspection, TrustedConstraint, TrustedSourceResolver } from './types.js';

type Branch = { [key: string]: ShapeNode };
function isBranch(value: ShapeNode): value is Branch {
  return value !== true && !(FORCED_MARKER in value) && !(typeof value.default === 'number' && typeof value.max === 'number');
}
const force = (value: JsonValue): ForcedGuardValue => ({ value, [FORCED_MARKER]: true });
const uniqueOperation = (method: string) => ['findUnique', 'update', 'delete'].includes(method);
const manyOperation = (method: string) => ['findMany', 'findFirst'].includes(method);

function object(value: PayloadValue | undefined, path: string, empty = false): Payload {
  if (!isPlainObject(value)) refuse(path, 'object', 'Expected concrete Prisma arguments');
  if (!empty && !Object.keys(value).length) refuse(path, 'empty', 'Choose at least one field');
  return value;
}
function allowed(value: Payload, names: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!names.includes(key)) refuse(`${path}.${key}`, 'unsupported', `Unsupported query argument: ${key}`);
}
function forcePresent(value: ShapeNode): boolean {
  return value !== true && (FORCED_MARKER in value || Object.values(value).some(entry => typeof entry === 'object' && entry !== null && forcePresent(entry)));
}
function readConstraint(input: TrustedConstraint): TrustedConstraint {
  const raw = record(readJsonValue(input), '$constraint');
  keys(raw, ['target', 'field', 'value'], '$constraint');
  const node = record(raw.value, '$constraint.value');
  const kind = enumeration(node.kind, ['source', 'literal'], '$constraint.value.kind');
  keys(node, kind === 'source' ? ['kind', 'name'] : ['kind', 'value'], '$constraint.value');
  const value: ForcedValue = kind === 'source' ? { kind, name: text(node.name, '$constraint.value.name') } : { kind, value: readJsonValue(node.value) };
  return { target: enumeration(raw.target, ['where', 'data'], '$constraint.target'), field: text(raw.field, '$constraint.field'), value };
}

function buildTemplate(input: unknown, supplied: TemplateContext, suppliedConstraints: readonly TrustedConstraint[], resolver: TrustedSourceResolver | undefined, resolveSources: boolean): DerivedTemplate {
  const query = readSavedQuery(input);
  const context = readTemplateContext(supplied);
  if (!sameSchema(query.schema, context.identity)) refuse('$query.schema', 'stale_schema', 'The schema changed. Review this query before accepting it again.');
  const model = modelFor(context.schema, query.model);
  const constraints = suppliedConstraints.map(readConstraint);
  const constraintKeys = new Set<string>();
  for (const constraint of constraints) {
    const key = `${constraint.target}.${constraint.field}`;
    if (constraintKeys.has(key)) refuse('$constraints', 'duplicate', `Duplicate trusted constraint: ${key}`);
    constraintKeys.add(key);
  }
  function bound(depth: number, path: string): void {
    if (depth > context.maxRelationDepth) refuse(path, 'relation_depth', 'The query exceeds the allowed relation depth');
  }
  function scalar(value: PayloadValue, field: ValueField, path: string): void {
    if (field.type === 'BigInt' && typeof value === 'number') {
      if (!Number.isSafeInteger(value)) refuse(path, 'bigint', 'Use a safe integer example for BigInt');
      validateLiteral(String(value), field, path);
    } else validateLiteral(value, field, path);
  }
  function unique(value: PayloadValue | undefined, target: ModelDescriptor, path: string): Branch {
    const input = object(value, path);
    const output: Branch = {};
    let complete = false;
    for (const [key, entry] of Object.entries(input)) {
      const selector = target.uniqueSelectors.find(selector => selector.name === key);
      if (!selector) refuse(`${path}.${key}`, 'unique_selector', 'Use a complete unique selector; additional predicates belong in trusted constraints');
      if (selector.fields.length === 1) {
        if (entry === null) refuse(`${path}.${key}`, 'unique_null', 'A unique selector cannot be null');
        scalar(entry, valueField(fieldFor(target, key, path), path), `${path}.${key}`);
        output[key] = true;
      } else {
        const values = object(entry, `${path}.${key}`);
        keys(values, selector.fields, `${path}.${key}`);
        const fields: Branch = {};
        for (const field of selector.fields) {
          scalar(values[field], { ...valueField(fieldFor(target, field, path), path), nullable: false }, `${path}.${key}.${field}`);
          fields[field] = true;
        }
        output[key] = fields;
      }
      complete = true;
    }
    if (!complete) refuse(path, 'unique_selector', 'A complete unique selector is required');
    return output;
  }
  function homogeneous(value: PayloadValue, path: string, derive: (item: PayloadValue, path: string) => Branch): Branch {
    if (!Array.isArray(value)) return derive(value, path);
    if (!value.length) refuse(path, 'empty', 'An empty array has no accepted structure');
    const shapes = value.map((item, index) => derive(item, `${path}[${index}]`));
    function comparable(node: ShapeNode): JsonValue {
      if (node === true) return true;
      if (FORCED_MARKER in node) return { intrinsicMode: 'default' };
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, typeof child === 'number' ? child : comparable(child)]));
    }
    const first = canonicalJson(comparable(shapes[0]));
    if (shapes.some(shape => canonicalJson(comparable(shape)) !== first)) refuse(path, 'ambiguous_array', 'Array items have different shapes; combining their permissions would widen this query');
    return shapes[0];
  }
  function filters(value: PayloadValue, target: ModelDescriptor, path: string, depth: number, nesting = 0): Branch {
    bound(depth, path);
    if (nesting > 12) refuse(path, 'filter_depth', 'Filter nesting is too deep');
    const input = object(value, path);
    const output: Branch = {};
    for (const [key, entry] of Object.entries(input)) {
      const at = `${path}.${key}`;
      if (['AND', 'OR', 'NOT'].includes(key)) {
        output[key] = homogeneous(entry, at, (item, next) => filters(item, target, next, depth, nesting + 1));
        if (key !== 'AND' && forcePresent(output[key])) refuse(at, 'negative_forced_mode', 'This negative filter cannot safely restrict implicit string mode in the current guard runtime');
        continue;
      }
      const field = fieldFor(target, key, at);
      if (field.kind === 'relation') {
        const branches = object(entry, at);
        const result: Branch = {};
        allowed(branches, field.list ? ['some', 'every', 'none'] : ['is', 'isNot'], at);
        for (const [operator, nested] of Object.entries(branches)) {
          const shape = filters(nested, modelFor(context.schema, field.model), `${at}.${operator}`, depth + 1, nesting + 1);
          if (['none', 'isNot'].includes(operator) && forcePresent(shape)) refuse(at, 'negative_forced_mode', 'Negative relation filters cannot mix implicit string mode and client filters');
          result[operator] = shape;
        }
        output[key] = result;
        continue;
      }
      const typed = valueField(field, at);
      if (typed.type === 'Bytes' || typed.type === 'Json') refuse(at, 'unsupported_filter', `${typed.type} filters are not supported by this derivation`);
      const inputOperators = isPlainObject(entry) ? entry : { equals: entry };
      const result: Branch = {};
      const operators = Object.keys(inputOperators).filter(key => key !== 'mode');
      if (!operators.length) refuse(at, 'empty', 'Specify a filter operator');
      for (const [operator, example] of Object.entries(inputOperators)) {
        if (operator === 'mode') continue;
        if (!operatorsFor(typed).includes(enumeration(operator, operatorsFor(typed), `${at}.${operator}`))) refuse(at, 'operator', 'Unsupported operator');
        if (['in', 'notIn', 'hasSome', 'hasEvery'].includes(operator)) {
          if (!Array.isArray(example) || !example.length) refuse(`${at}.${operator}`, 'array', 'Use a nonempty array of scalar examples');
          for (const item of example) scalar(item, { ...typed, list: false, nullable: false }, `${at}.${operator}`);
        } else if (operator === 'has') scalar(example, { ...typed, list: false, nullable: false }, `${at}.${operator}`);
        else if (operator === 'isEmpty') bool(example, `${at}.${operator}`);
        else scalar(example, operator === 'equals' ? typed : { ...typed, nullable: false }, `${at}.${operator}`);
        result[operator] = true;
      }
      const implicitMode = usesForcedStringMode(typed, operators);
      if ('mode' in inputOperators) {
        if (!implicitMode) refuse(at, 'mode', 'This filter does not support string mode');
        enumeration(inputOperators.mode, ['default', 'insensitive'], `${at}.mode`);
        result.mode = true;
      } else if (implicitMode) result.mode = force('default');
      output[key] = result;
    }
    return output;
  }
  function ordering(value: PayloadValue, target: ModelDescriptor, path: string, depth: number): Branch {
    bound(depth, path);
    return homogeneous(value, path, (item, at) => {
      const input = object(item, at);
      const result: Branch = {};
      for (const [key, direction] of Object.entries(input)) {
        const field = fieldFor(target, key, `${at}.${key}`);
        if (field.kind === 'relation') {
          if (field.list) refuse(`${at}.${key}`, 'relation_order', 'Relation-count ordering is not supported');
          result[key] = ordering(direction, modelFor(context.schema, field.model), `${at}.${key}`, depth + 1);
        } else {
          if (!canOrder(field)) refuse(`${at}.${key}`, 'order_type', 'This field cannot be ordered');
          enumeration(direction, ['asc', 'desc'], `${at}.${key}`);
          result[key] = true;
        }
      }
      return result;
    });
  }
  function projection(value: PayloadValue, target: ModelDescriptor, mode: 'select' | 'include', path: string, depth: number): Branch {
    bound(depth, path);
    const input = object(value, path);
    const result: Branch = {};
    for (const [key, selection] of Object.entries(input)) {
      const field = fieldFor(target, key, `${path}.${key}`);
      if (field.kind === 'unsupported') refuse(`${path}.${key}`, 'unsupported_projection', 'An unsupported field cannot be projected');
      if (mode === 'include' && field.kind !== 'relation') refuse(`${path}.${key}`, 'include', 'include accepts relations only');
      if (field.kind !== 'relation') {
        if (selection !== true) refuse(`${path}.${key}`, 'projection', 'Select a field with true, or remove it from the template');
        result[key] = true;
      } else {
        bound(depth + 1, `${path}.${key}`);
        const related = modelFor(context.schema, field.model);
        if (selection === true) result[key] = { select: defaultProjection(related, `${path}.${key}`) };
        else {
          const nested = object(selection, `${path}.${key}`);
          allowed(nested, field.list ? ['select', 'include', 'where', 'orderBy', 'take', 'skip'] : ['select', 'include'], `${path}.${key}`);
          result[key] = readArguments(nested, related, `${path}.${key}`, depth + 1, false);
        }
      }
    }
    return result;
  }
  function defaultProjection(target: ModelDescriptor, path: string): Branch {
    if (target.fields.some(field => field.kind === 'unsupported')) refuse(path, 'implicit_projection', 'Use an explicit select when the model contains unsupported fields');
    return Object.fromEntries(target.fields.filter(field => field.kind !== 'relation').map(field => [field.name, true]));
  }
  function data(value: PayloadValue, target: ModelDescriptor, path: string, depth: number): Branch {
    bound(depth, path);
    const input = object(value, path);
    const result: Branch = {};
    for (const [key, sample] of Object.entries(input)) {
      const field = fieldFor(target, key, `${path}.${key}`);
      if (field.kind === 'relation') {
        if (depth > 0) refuse(`${path}.${key}`, 'nested_write_depth', 'The guard runtime does not support relation writes inside nested mutation data');
        const operations = object(sample, `${path}.${key}`);
        allowed(operations, ['connect'], `${path}.${key}`);
        if (!field.list && Array.isArray(operations.connect)) refuse(`${path}.${key}.connect`, 'relation_cardinality', 'A to-one relation requires one unique selector, not an array');
        bound(depth + 1, `${path}.${key}`);
        result[key] = { connect: homogeneous(operations.connect, `${path}.${key}.connect`, (item, at) => unique(item, modelFor(context.schema, field.model), at)) };
      } else {
        const typed = valueField(field, `${path}.${key}`);
        if (!typed.writable) refuse(`${path}.${key}`, 'readonly_field', 'This field is controlled by Prisma');
        if (typed.type === 'Bytes') refuse(`${path}.${key}`, 'bytes', 'Binary query templates are not supported');
        scalar(sample, typed, `${path}.${key}`);
        result[key] = true;
      }
    }
    return result;
  }
  function readArguments(input: Payload, target: ModelDescriptor, path: string, depth: number, root: boolean): TemplateGuardShape {
    const result: TemplateGuardShape = {};
    if ('select' in input && 'include' in input) refuse(path, 'projection_conflict', 'Prisma select and include cannot be used together at the same level');
    if ('select' in input) result.select = projection(input.select, target, 'select', `${path}.select`, depth);
    else if ('include' in input) result.include = projection(input.include, target, 'include', `${path}.include`, depth);
    else result.select = defaultProjection(target, path);
    if ('where' in input) result.where = root && uniqueOperation(query.operation) ? unique(input.where, target, `${path}.where`) : filters(input.where, target, `${path}.where`, depth);
    if ('orderBy' in input) result.orderBy = ordering(input.orderBy, target, `${path}.orderBy`, depth);
    if ('skip' in input) { integer(input.skip, 0, Number.MAX_SAFE_INTEGER, `${path}.skip`); result.skip = true; }
    if ('take' in input) { const take = integer(input.take, 1, context.maxTake, `${path}.take`); result.take = { default: take, max: take }; }
    if ('data' in input) result.data = data(input.data, target, `${path}.data`, depth);
    return result;
  }
  const allowedArgs = ['select', 'include', ...(query.operation === 'create' ? [] : ['where']),
    ...(manyOperation(query.operation) ? ['orderBy', 'skip', 'take'] : []), ...(['create', 'update'].includes(query.operation) ? ['data'] : [])];
  allowed(query.payload, allowedArgs, '$query.payload');
  if (uniqueOperation(query.operation) && !('where' in query.payload)) refuse('$query.payload.where', 'required', 'A unique selector is required');
  if (['create', 'update'].includes(query.operation) && !('data' in query.payload)) refuse('$query.payload.data', 'required', 'Mutation data is required');
  const shape = readArguments(query.payload, model, '$query.payload', 0, true);
  for (const constraint of sorted(constraints, item => `${item.target}.${item.field}`)) {
    const at = `$constraints.${constraint.target}.${constraint.field}`;
    if (constraint.target === 'where' && query.operation === 'create') refuse(at, 'constraint_target', 'create does not support where constraints');
    if (constraint.target === 'data' && !['create', 'update'].includes(query.operation)) refuse(at, 'constraint_target', 'Data constraints require a mutation');
    const field = valueField(fieldFor(model, constraint.field, at), at);
    if (constraint.target === 'data' && !field.writable) refuse(at, 'readonly_field', 'This field is controlled by Prisma');
    let resolved: JsonValue;
    if (constraint.value.kind === 'literal') resolved = validateLiteral(constraint.value.value, field, at);
    else if (!resolveSources) resolved = null;
    else {
      if (!resolver) refuse(at, 'unresolved_source', 'A server-owned source resolver is required');
      let value: JsonValue;
      try { value = resolver(Object.freeze({ source: constraint.value.name, model: query.model, operation: query.operation, usageKey: query.usageKey, target: constraint.target, field: constraint.field })); }
      catch { refuse(at, 'source_failed', 'The trusted source could not be resolved'); }
      resolved = validateLiteral(readJsonValue(value), field, at);
    }
    const branch = shape[constraint.target];
    if (branch !== undefined && !isBranch(branch)) refuse(at, 'constraint_shape', 'Cannot apply a constraint to this query');
    const target: Branch = branch === undefined ? {} : branch;
    if (constraint.target === 'where' && !uniqueOperation(query.operation)) {
      if (field.type === 'Bytes' || field.type === 'Json') refuse(at, 'constraint_type', 'This field cannot be used in a where constraint');
      target[constraint.field] = { equals: force(resolved), ...(usesForcedStringMode(field, ['equals']) ? { mode: force('default') } : {}) };
    } else target[constraint.field] = force(resolved);
    shape[constraint.target] = target;
  }
  if (query.operation === 'create') {
    const suppliedData = shape.data;
    for (const field of model.fields) {
      if ((field.kind === 'scalar' || field.kind === 'enum') && field.writable && !field.nullable && !field.hasDefault &&
          (suppliedData === undefined || suppliedData === true || !Object.hasOwn(suppliedData, field.name))) {
        refuse(`$query.payload.data.${field.name}`, 'required_field', 'A required create field needs a sample value or a trusted data constraint');
      }
    }
  }
  function ordered(node: ShapeNode): ShapeNode {
    if (node === true) return node;
    if (FORCED_MARKER in node) return force(parseJson(canonicalJson(node.value)));
    if ('default' in node && 'max' in node && typeof node.default === 'number' && typeof node.max === 'number') return { default: node.default, max: node.max };
    if (!isBranch(node)) refuse('$shape', 'shape', 'Invalid generated branch');
    return Object.fromEntries(Object.entries(node).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, ordered(value)]));
  }
  return { queryId: query.id, model: query.model, operation: query.operation, usageKey: query.usageKey, schema: { ...query.schema },
    shape: Object.fromEntries(Object.entries(shape).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, ordered(value)])),
    requirements: { enforceProjection: true, trustedVariantSelection: true } };
}

export function inspectTemplate(input: unknown, context: TemplateContext, constraints: readonly TrustedConstraint[] = []): TemplateInspection {
  const result = resultOf(() => buildTemplate(input, context, constraints, undefined, false));
  if (!result.ok) return { state: result.issues.some(issue => ['stale_schema', 'stale_model', 'stale_field'].includes(issue.code)) ? 'stale' : 'invalid', issues: result.issues };
  const query = readSavedQuery(input);
  return { state: !query.accepted ? 'draft' : !query.enabled ? 'disabled' : 'accepted', issues: [] };
}
export function deriveGuard(input: unknown, context: TemplateContext, constraints: readonly TrustedConstraint[] = [], resolver?: TrustedSourceResolver): DerivedTemplate {
  const query: SavedQueryTemplate = readSavedQuery(input);
  if (!query.accepted || !query.enabled) refuse('$query', 'not_accepted', 'Only enabled, accepted templates may generate a guard');
  return buildTemplate(query, context, constraints, resolver, true);
}
