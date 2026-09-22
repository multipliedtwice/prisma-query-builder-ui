<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { parseJson } from '../../src/core/json.js';
  import type { SavedQueryWorkspaceProps } from '../../src/svelte/types.js';
  import { readSavedQueries, readSavedQuery, readUsageManifest, assertStableIdentity, serializeSavedQuery } from '../../src/templates/index.js';
  import type { SavedQueryTemplate, UsageBinding, SchemaIdentity } from '../../src/templates/types.js';
  import { exampleQueries, templateContext, exampleManifest, trustedExample } from '../fixtures/templates.js';
  let { children }: { children: Snippet<[SavedQueryWorkspaceProps]> } = $props();
  const key = 'dee-wan.query-template-preview.v1';
  let queries = $state<SavedQueryTemplate[]>([]);
  let savedQueries = $state<SavedQueryTemplate[]>([]);
  let bindings = $state<UsageBinding[]>([]);
  let ready = $state(false);
  let usageSchema = $state<SchemaIdentity>(templateContext.identity);
  let error = $state('');
  function persisted() {
    const input = localStorage.getItem(key);
    if (!input) return { queries: readSavedQueries(exampleQueries), manifest: readUsageManifest(exampleManifest) };
    const value: unknown = parseJson(input);
    if (!value || typeof value !== 'object' || !('queries' in value) || !('manifest' in value) || Object.keys(value).length !== 2) throw new Error('The saved preview workspace is invalid.');
    return { queries: readSavedQueries(value.queries), manifest: readUsageManifest(value.manifest) };
  }
  function store(nextQueries: SavedQueryTemplate[], nextBindings: UsageBinding[], schema: SchemaIdentity) {
    const collection = readSavedQueries(nextQueries);
    const manifest = readUsageManifest({ version: 1, schema, bindings: nextBindings });
    localStorage.setItem(key, JSON.stringify({ queries: collection, manifest }));
    savedQueries = collection;
    bindings = manifest.bindings; usageSchema = manifest.schema;
  }
  onMount(() => {
    try { const existing = persisted(); store(existing.queries, existing.manifest.bindings, existing.manifest.schema); queries = readSavedQueries(existing.queries); ready = true; }
    catch { error = 'The saved preview data could not be read.'; }
  });
  async function save(query: SavedQueryTemplate) {
    const snapshot = readSavedQuery(query);
    const latest = persisted();
    const existing = latest.queries.find(query => query.id === snapshot.id);
    const baseline = savedQueries.find(query => query.id === snapshot.id);
    if ((existing && !baseline) || (!existing && baseline)) throw new Error('This query was added or removed in another tab. Reload before saving.');
    if (existing && baseline && serializeSavedQuery(existing) !== serializeSavedQuery(baseline)) throw new Error('This query changed in another tab. Reload before overwriting it.');
    if (existing) assertStableIdentity(existing, snapshot);
    store(existing ? latest.queries.map(query => query.id === snapshot.id ? snapshot : query) : [...latest.queries, snapshot], latest.manifest.bindings, latest.manifest.schema);
    return snapshot;
  }
  async function remove(query: SavedQueryTemplate) {
    const latest = persisted();
    if (latest.manifest.bindings.some(binding => binding.queryId === query.id)) throw new Error('Unlink this query from application usages before deleting it.');
    const existing = latest.queries.find(item => item.id === query.id);
    if (existing && serializeSavedQuery(existing) !== serializeSavedQuery(query)) throw new Error('This query changed in another tab. Reload before deleting it.');
    store(latest.queries.filter(item => item.id !== query.id), latest.manifest.bindings, latest.manifest.schema);
  }
  async function link(query: SavedQueryTemplate, routeIds: string[]) {
    const latest = persisted();
    const saved = latest.queries.find(item => item.id === query.id);
    if (!saved || serializeSavedQuery(saved) !== serializeSavedQuery(query)) throw new Error('Save or reload the query before updating its usages.');
    if (new Set(routeIds).size !== routeIds.length) throw new Error('A route cannot be linked twice.');
    for (const id of routeIds) {
      const route = trustedExample.routes.find(route => route.id === id);
      if (!route || route.model !== query.model || route.operation !== query.operation || latest.manifest.bindings.some(binding => binding.routeId === id && binding.queryId !== query.id)) throw new Error('The route is unknown, incompatible, or already assigned.');
    }
    const next = [...latest.manifest.bindings.filter(binding => binding.queryId !== query.id), ...routeIds.map(routeId => ({ routeId, queryId: query.id, model: query.model, operation: query.operation, usageKey: query.usageKey }))];
    store(latest.queries, next, templateContext.identity);
    return next;
  }
</script>

{#if error}<div role="alert" class="grid justify-items-start gap-2 rounded-md border border-destructive p-4 text-sm text-destructive"><p>{error}</p><button type="button" class="rounded-md border border-border px-3 py-2 text-foreground" onclick={() => { localStorage.removeItem(key); location.reload(); }}>Reset preview data</button></div>
{:else if ready}
  {#if usageSchema.id !== templateContext.identity.id || usageSchema.revision !== templateContext.identity.revision}<p role="alert">Application usages need review for the current schema. Generation remains blocked until their mappings are reviewed.</p>{/if}
  {@render children({ context: templateContext, model: 'User', queries, savedQueries, bindings, trustedRoutes: trustedExample.routes,
    createId: () => crypto.randomUUID(), onchange: value => queries = readSavedQueries(value), onSave: save, onDelete: remove, onLink: link })}
{:else}<p role="status">Loading saved queries…</p>{/if}
