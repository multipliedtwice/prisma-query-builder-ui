import { array, bool, canonicalJson, distinct, enumeration, integer, keys, name, readJsonValue, record, refuse, resultOf, safeKey, text } from '../core/json.js';
import { readSchema } from '../core/schema.js';
import type { ValidationResult } from '../core/types.js';
import { isPlainObject } from '../query/payload.js';
import { QUERY_OPERATIONS, type SavedQueryTemplate, type SchemaIdentity, type TemplateContext } from './types.js';

export function usageKey(value: unknown, path: string): string {
  const key = text(value, path);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(key) || key.length > 160) refuse(path, 'usage_key', 'Use a stable lowercase usage key such as public-profile');
  return key;
}
export function readSchemaIdentity(input: unknown, path = '$schema'): SchemaIdentity {
  const value = record(readJsonValue(input), path);
  keys(value, ['id', 'revision'], path);
  return { id: text(value.id, `${path}.id`), revision: text(value.revision, `${path}.revision`) };
}
export function readTemplateContext(input: TemplateContext): TemplateContext {
  return { schema: readSchema(input.schema), identity: readSchemaIdentity(input.identity),
    maxRelationDepth: integer(input.maxRelationDepth, 0, 8, '$context.maxRelationDepth'),
    maxTake: integer(input.maxTake, 1, 10000, '$context.maxTake') };
}
export function readSavedQuery(input: unknown): SavedQueryTemplate {
  const value = record(readJsonValue(input), '$query');
  keys(value, ['version', 'id', 'name', 'model', 'operation', 'usageKey', 'payload', 'enabled', 'accepted', 'schema'], '$query');
  integer(value.version, 1, 1, '$query.version');
  const payload = value.payload;
  if (!isPlainObject(payload)) refuse('$query.payload', 'object', 'Prisma query arguments must be an object');
  const label = text(value.name, '$query.name');
  if (!label.trim()) refuse('$query.name', 'name', 'A query name is required');
  return { version: 1, id: safeKey(text(value.id, '$query.id'), '$query.id'), name: label, model: name(value.model, '$query.model'),
    operation: enumeration(value.operation, QUERY_OPERATIONS, '$query.operation'), usageKey: usageKey(value.usageKey, '$query.usageKey'),
    payload, enabled: bool(value.enabled, '$query.enabled'), accepted: bool(value.accepted, '$query.accepted'), schema: readSchemaIdentity(value.schema) };
}
export function readSavedQueries(input: unknown): SavedQueryTemplate[] {
  const queries = array(readJsonValue(input), '$queries', value => readSavedQuery(value));
  distinct(queries, query => query.id, '$queries');
  distinct(queries, query => [query.model, query.operation, query.usageKey].join('\0'), '$queries');
  return queries;
}
export function validateSavedQueries(input: unknown): ValidationResult<SavedQueryTemplate[]> { return resultOf(() => readSavedQueries(input)); }
export function serializeSavedQuery(query: SavedQueryTemplate): string { return canonicalJson(readSavedQuery(query)); }
export function sameSchema(left: SchemaIdentity, right: SchemaIdentity): boolean { return left.id === right.id && left.revision === right.revision; }
export function queryChanged(current: SavedQueryTemplate, saved: SavedQueryTemplate | undefined): boolean {
  return saved === undefined || serializeSavedQuery(current) !== serializeSavedQuery(saved);
}
export function assertStableIdentity(previous: SavedQueryTemplate, next: SavedQueryTemplate): void {
  for (const key of ['id', 'model', 'operation', 'usageKey'] as const) {
    if (previous[key] !== next[key]) refuse(`$query.${key}`, 'identity', 'Saved query identity is immutable; duplicate the query for a different usage');
  }
}
