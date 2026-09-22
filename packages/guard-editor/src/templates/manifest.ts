import { array, distinct, enumeration, integer, keys, readJsonValue, record, refuse, sorted, text } from '../core/json.js';
import { deriveGuard } from './derive.js';
import { readSavedQueries, readSchemaIdentity, sameSchema, usageKey } from './saved-query.js';
import { QUERY_OPERATIONS, type GeneratedUsageManifest, type HookReferences, type TemplateContext, type TrustedGenerationContext, type TrustedSourceResolver, type UsageManifest } from './types.js';

export function readUsageManifest(input: unknown): UsageManifest {
  const value = record(readJsonValue(input), '$manifest');
  keys(value, ['version', 'schema', 'bindings'], '$manifest');
  integer(value.version, 1, 1, '$manifest.version');
  const bindings = distinct(array(value.bindings, '$manifest.bindings', (entry, path) => {
    const binding = record(entry, path);
    keys(binding, ['routeId', 'queryId', 'model', 'operation', 'usageKey'], path);
    return { routeId: text(binding.routeId, `${path}.routeId`), queryId: text(binding.queryId, `${path}.queryId`),
      model: text(binding.model, `${path}.model`), operation: enumeration(binding.operation, QUERY_OPERATIONS, `${path}.operation`), usageKey: usageKey(binding.usageKey, `${path}.usageKey`) };
  }), binding => binding.routeId, '$manifest.bindings');
  return { version: 1, schema: readSchemaIdentity(value.schema), bindings };
}
function readHooks(input: HookReferences, registered: readonly string[], path: string): HookReferences {
  const value = record(readJsonValue(input), path);
  keys(value, ['before', 'after'], path);
  const read = (value: unknown, path: string) => distinct(array(value, path, (id, at) => {
    const key = text(id, at);
    if (!registered.includes(key)) refuse(at, 'unknown_hook', 'The hook is not registered by the server');
    return key;
  }), key => key, path);
  return { before: read(value.before, `${path}.before`), after: read(value.after, `${path}.after`) };
}
export function generateUsageManifest(input: unknown, manifestInput: unknown, context: TemplateContext, trusted: TrustedGenerationContext, resolver?: TrustedSourceResolver): GeneratedUsageManifest {
  const queries = readSavedQueries(input);
  const manifest = readUsageManifest(manifestInput);
  if (!sameSchema(manifest.schema, context.identity)) refuse('$manifest.schema', 'stale_schema', 'Review usage mappings after a schema change');
  const routes = distinct([...trusted.routes], route => route.id, '$trusted.routes');
  distinct([...trusted.hookIds], id => id, '$trusted.hookIds');
  distinct([...trusted.variants], item => item.queryId, '$trusted.variants');
  distinct([...trusted.operations], item => `${item.model}.${item.operation}`, '$trusted.operations');
  const hooks = new Map<string, HookReferences>();
  for (const extension of trusted.variants) {
    if (!queries.some(query => query.id === extension.queryId)) refuse('$trusted.variants', 'unknown_query', 'A trusted extension references an unknown query');
    hooks.set(extension.queryId, readHooks(extension.hooks, trusted.hookIds, '$trusted.variants.hooks'));
  }
  const operationHooks = new Map<string, HookReferences>();
  for (const extension of trusted.operations) {
    if (!queries.some(query => query.model === extension.model && query.operation === extension.operation)) refuse('$trusted.operations', 'unknown_operation', 'The hook references an operation without a saved query');
    operationHooks.set(`${extension.model}.${extension.operation}`, readHooks(extension.hooks, trusted.hookIds, '$trusted.operations.hooks'));
  }
  for (const binding of manifest.bindings) {
    const route = routes.find(route => route.id === binding.routeId);
    const query = queries.find(query => query.id === binding.queryId);
    if (!route || !query) refuse('$manifest.bindings', 'unknown_mapping', 'A usage mapping references an unknown trusted route or query');
    if (!query.accepted || !query.enabled) refuse('$manifest.bindings', 'inactive_mapping', 'A trusted route references a disabled or unaccepted query');
    if (route.model !== query.model || route.operation !== query.operation || binding.model !== query.model || binding.operation !== query.operation || binding.usageKey !== query.usageKey) {
      refuse('$manifest.bindings', 'mapping_mismatch', 'The route, operation, query, and usage identity must match exactly');
    }
  }
  for (const route of routes) if (!manifest.bindings.some(binding => binding.routeId === route.id)) refuse('$manifest.bindings', 'missing_route', `The trusted route ${route.id} has no query mapping`);
  const active = queries.filter(query => query.accepted && query.enabled);
  for (const query of active) if (!manifest.bindings.some(binding => binding.queryId === query.id)) refuse('$manifest.bindings', 'missing_usage', `The accepted query ${query.name} has no trusted route mapping`);
  const variants = sorted(active, query => `${query.model}\0${query.operation}\0${query.usageKey}`).map(query =>
    deriveGuard(query, context, trusted.variants.find(extension => extension.queryId === query.id)?.constraints ?? [], resolver));
  return { version: 1, schema: { ...manifest.schema }, variants, variantSelection: 'trusted-server-route-only',
    routes: sorted(manifest.bindings, binding => binding.routeId).map(binding => {
      const operation = operationHooks.get(`${binding.model}.${binding.operation}`);
      const variant = hooks.get(binding.queryId);
      return { ...binding, hooks: { before: [...(operation?.before ?? []), ...(variant?.before ?? [])], after: [...(variant?.after ?? []), ...(operation?.after ?? [])] } };
    }) };
}
