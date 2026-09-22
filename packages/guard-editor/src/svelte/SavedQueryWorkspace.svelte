<script lang="ts">
  import { tick, untrack } from 'svelte';
  import QueryEditor from '../../../../src/components/QueryEditor.svelte';
  import QueryTabBar from '../../../../src/components/QueryTabBar.svelte';
  import Button from '../../../../src/lib/components/ui/button/button.svelte';
  import { createQuerySchema, readSavedQueries, readSavedQuery, readUsageManifest, queryChanged, inspectTemplate, editTemplate, reviewTemplate, beginSave, acknowledgeSave, QUERY_OPERATIONS } from '../templates/index.js';
  import type { SavedQueryTemplate, QueryOperation } from '../templates/types.js';
  import type { QueryState } from '../query/types.js';
  import type { SavedQueryWorkspaceProps } from './types.js';
  import './workspace.css';

  let { context, model, queries, savedQueries, bindings, trustedRoutes, createId, onchange, onSave, onDelete, onLink, readOnly = false, onDirtyChange }: SavedQueryWorkspaceProps = $props();
  const uid = $props.id();
  let activeId = $state('');
  let openIds = $state<string[]>([]);
  let filter = $state('');
  let search = $state('');
  let paths = $state<Record<string, string[]>>({});
  let drafts = $state<Record<string, string | null>>({});
  let codeValid = $state<Record<string, boolean>>({});
  let pending = $state<Record<string, boolean>>({});
  let messages = $state<Record<string, { kind: 'success' | 'error'; text: string }>>({});
  let globalError = $state('');
  let dialog = $state<'create' | 'duplicate' | 'delete' | 'link' | 'rename' | null>(null);
  let dialogQuery = $state<SavedQueryTemplate | null>(null);
  let dialogElement = $state<HTMLDialogElement | null>(null);
  let dialogName = $state('');
  let dialogUsage = $state('');
  let dialogOperation = $state<QueryOperation>('findMany');
  let dialogRoutes = $state<string[]>([]);
  let dialogError = $state('');
  let dialogPending = $state(false);
  let actionsOpen = $state(false);
  let actionsElement = $state<HTMLDetailsElement | null>(null);
  let returningFocus: HTMLElement | null = null;
  let workspaceElement = $state<HTMLElement | null>(null);
    const catalog = $derived.by(() => {
    try {
      const parser = createQuerySchema(context);
      const current = readSavedQueries(queries);
      const saved = readSavedQueries(savedQueries);
      readUsageManifest({ version: 1, schema: context.identity, bindings });
      if (!context.schema.models.some(item => item.name === model)) throw new Error('The selected model is not in the supplied schema.');
      return { queries: current, saved, parser, error: '' };
    } catch (error) { return { queries: [], saved: [], parser: null, error: message(error) }; }
  });
  const parser = $derived(catalog.parser);
  const modelQueries = $derived(catalog.queries.filter(query => query.model === model));
  const visibleQueries = $derived(modelQueries.filter(query => (!filter || query.operation === filter) && `${query.name} ${query.usageKey}`.toLowerCase().includes(search.trim().toLowerCase())));
  const visibleGroups = $derived(byOperation(visibleQueries));
  const modelGroups = $derived(byOperation(modelQueries));
  const active = $derived(modelQueries.find(query => query.id === activeId));
  const inspection = $derived(active ? inspectTemplate(active, context) : null);
  const currentState = $derived(active && parser ? { operation: parser.operation(active.model, active.operation), payload: active.payload, path: paths[active.id] ?? [] } : null);
  const hasDirty = $derived(modelQueries.some(dirty));
  const anyPending = $derived(Object.values(pending).some(Boolean));
  const tabs = $derived(openIds.map(id => modelQueries.find(query => query.id === id)).filter((query): query is SavedQueryTemplate => query !== undefined).map(query => ({ id: query.id, name: query.name, dirty: dirty(query) })));
  const activeRoutes = $derived(active ? bindings.filter(binding => binding.queryId === active.id).map(binding => trustedRoutes.find(route => route.id === binding.routeId)?.label ?? binding.routeId) : []);
  const linkable = $derived(dialogQuery ? trustedRoutes.filter(route => route.model === dialogQuery?.model && route.operation === dialogQuery?.operation && !bindings.some(binding => binding.routeId === route.id && binding.queryId !== dialogQuery?.id)) : []);

  function byOperation(list: SavedQueryTemplate[]) {
    return QUERY_OPERATIONS.map(operation => ({ operation, queries: list.filter(query => query.operation === operation) })).filter(group => group.queries.length > 0);
  }
  function issueText(issue: { path: string; code: string; message: string }): string {
    const at = issue.code.startsWith('stale_') ? '' : issue.path.replace(/^\$query\.?/, '').replace(/^payload\.?/, '');
    return at ? `${at}: ${issue.message}` : issue.message;
  }
  function message(error: unknown): string { return error instanceof Error ? error.message.replace(/^\$[\w.[\]]*:\s*/, '') : 'The operation failed. Your edits are retained.'; }
  function dirty(query: SavedQueryTemplate): boolean {
    return codeValid[query.id] === false || queryChanged(query, catalog.saved.find(saved => saved.id === query.id));
  }
  function select(id: string) { activeId = id; if (!openIds.includes(id)) openIds = [...openIds, id]; }
  function replace(query: SavedQueryTemplate) {
    if (readOnly) return;
    try { onchange(readSavedQueries(queries.map(item => item.id === query.id ? query : item))); messages = { ...messages, [query.id]: { kind: 'success', text: '' } }; globalError = ''; }
    catch (error) { globalError = message(error); }
  }
  function updateState(id: string, state: QueryState) {
    paths = { ...paths, [id]: state.path };
    const query = queries.find(query => query.id === id);
    if (query && !readOnly) { const next = editTemplate(query, state.payload); if (next !== query) replace(next); }
  }
  function updateDraft(id: string, code: string | null) {
    untrack(() => { if (drafts[id] !== code) drafts = { ...drafts, [id]: code }; });
  }
  function updateValidity(id: string, valid: boolean) {
    untrack(() => { if (codeValid[id] !== valid) codeValid = { ...codeValid, [id]: valid }; });
  }
  function rename(id: string, name: string) { const query = queries.find(query => query.id === id); if (query) replace({ ...query, name }); }
  function accept(query: SavedQueryTemplate) {
    try { replace(query.accepted && inspectTemplate(query, context).state !== 'stale' ? { ...query, accepted: false } : reviewTemplate(query, context)); }
    catch (error) { messages = { ...messages, [query.id]: { kind: 'error', text: message(error) } }; }
  }
  async function save(query: SavedQueryTemplate): Promise<boolean> {
    if (readOnly || !onSave || pending[query.id] || codeValid[query.id] === false) return false;
    pending = { ...pending, [query.id]: true };
    try {
      const ticket = beginSave(query, context);
      acknowledgeSave(ticket, await onSave(ticket.query));
      messages = { ...messages, [query.id]: { kind: 'success', text: 'Saved' } };
      return true;
    } catch (error) {
      messages = { ...messages, [query.id]: { kind: 'error', text: message(error) } };
      return false;
    } finally { pending = { ...pending, [query.id]: false }; }
  }
  async function saveAll() {
    const snapshots = modelQueries.filter(dirty).map(query => readSavedQuery(query));
    for (const query of snapshots) await save(query);
  }
  function showDialog(kind: 'create' | 'duplicate' | 'delete' | 'link' | 'rename') {
    if (readOnly) return;
    returningFocus = typeof document === 'undefined' ? null : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (returningFocus?.closest('details')) returningFocus = returningFocus.closest('details')?.querySelector('summary') ?? returningFocus;
    actionsOpen = false;
    dialogQuery = active ? readSavedQuery(active) : null;
    dialogName = kind === 'rename' && active ? active.name : kind === 'duplicate' && active ? `${active.name} copy` : '';
    dialogUsage = kind === 'duplicate' && active ? `${active.usageKey}-copy` : '';
    dialogOperation = active?.operation ?? 'findMany';
    dialogRoutes = bindings.filter(binding => binding.queryId === active?.id).map(binding => binding.routeId);
    dialogError = ''; dialog = kind;
  }
  async function closeDialog() {
    if (dialogPending) return;
    dialogElement?.close(); dialog = null;
    await tick();
    const fallback = returningFocus?.closest('.query-more-actions') ? workspaceElement?.querySelector<HTMLElement>('.query-more-actions summary') : null;
    (returningFocus?.isConnected ? returningFocus : fallback ?? workspaceElement?.querySelector<HTMLElement>('.query-workspace-header button'))?.focus();
  }
  function dismissActions(target: EventTarget | null) {
    if (actionsElement?.open && !(target instanceof Node && actionsElement.contains(target))) { actionsElement.open = false; actionsOpen = false; }
  }
  function menuDismissal(node: HTMLDetailsElement) {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !node.open) return;
      event.preventDefault(); node.open = false; actionsOpen = false; node.querySelector('summary')?.focus();
    };
    const focusout = (event: FocusEvent) => dismissActions(event.relatedTarget);
    node.addEventListener('keydown', keydown); node.addEventListener('focusout', focusout);
    return () => { node.removeEventListener('keydown', keydown); node.removeEventListener('focusout', focusout); };
  }
  async function submitDialog(event: SubmitEvent) {
    event.preventDefault(); if (readOnly || !dialog) return;
    dialogError = ''; dialogPending = true;
    try {
      const naming = dialog === 'rename' || dialog === 'create' || dialog === 'duplicate';
      if (naming && !dialogName.trim()) throw new Error('Enter a query name.');
      if ((dialog === 'create' || dialog === 'duplicate') && queries.some(query => query.model === model && query.operation === dialogOperation && query.usageKey === dialogUsage)) throw new Error(`Another ${dialogOperation} query already uses the usage key “${dialogUsage}”.`);
      if (dialog === 'rename' && dialogQuery) {
        const next = readSavedQuery({ ...dialogQuery, name: dialogName.trim() });
        replace(next);
      } else if (dialog === 'create' || dialog === 'duplicate') {
        const query = readSavedQuery({ version: 1, id: createId(), name: dialogName.trim(), model, operation: dialogOperation,
          usageKey: dialogUsage, payload: dialog === 'duplicate' && dialogQuery ? dialogQuery.payload : {}, enabled: true, accepted: false, schema: context.identity });
        onchange(readSavedQueries([...queries, query])); select(query.id);
      } else if (dialog === 'delete' && dialogQuery) {
        const query = dialogQuery;
        if (bindings.some(binding => binding.queryId === query.id)) throw new Error('Unlink application usages before deleting this query.');
        const saved = savedQueries.find(item => item.id === query.id);
        if (saved) { if (!onDelete) throw new Error('Deletion is not connected to storage.'); await onDelete(readSavedQuery(saved)); }
        onchange(queries.filter(item => item.id !== query.id));
        openIds = openIds.filter(id => id !== query.id);
      } else if (dialog === 'link' && dialogQuery) {
        if (!onLink) throw new Error('Usage linking is not connected.');
        const query = dialogQuery;
        if (!savedQueries.some(saved => saved.id === query.id) || dirty(query)) throw new Error('Save this query before linking application usages.');
        if (dialogRoutes.some(id => !linkable.some(route => route.id === id))) throw new Error('A selected route is no longer available.');
        const accepted = readUsageManifest({ version: 1, schema: context.identity, bindings: await onLink(query, [...dialogRoutes]) }).bindings;
        const routes = accepted.filter(binding => binding.queryId === query.id);
        if (routes.length !== dialogRoutes.length || dialogRoutes.some(id => !routes.some(route => route.routeId === id)) || routes.some(binding => !dialogRoutes.includes(binding.routeId) || binding.model !== query.model || binding.operation !== query.operation || binding.usageKey !== query.usageKey)) throw new Error('The owner did not confirm the requested usage mappings.');
      }
      dialogPending = false; closeDialog();
    } catch (error) { dialogError = message(error); }
    finally { dialogPending = false; }
  }
  $effect(() => {
    const ids = modelQueries.map(query => query.id);
    untrack(() => { if (!ids.includes(activeId)) { activeId = ids[0] ?? ''; if (activeId && !openIds.includes(activeId)) openIds = [...openIds, activeId]; } });
  });
  $effect(() => { const changed = hasDirty; untrack(() => onDirtyChange?.(changed)); });
  $effect(() => {
    if (!activeId) return;
    tick().then(() => {
      const list = workspaceElement?.querySelector<HTMLElement>('.query-explorer nav');
      const item = list?.querySelector<HTMLElement>('[aria-current="true"]');
      if (!list || !item) return;
      const header = item.closest('.query-group')?.querySelector('h3')?.offsetHeight ?? 0;
      const top = item.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      if (top - header < list.scrollTop) list.scrollTop = top - header;
      else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + item.offsetHeight - list.clientHeight;
    });
  });
  $effect(() => { if (dialog && dialogElement && !dialogElement.open) dialogElement.showModal(); });
</script>

<section class="saved-query-workspace" bind:this={workspaceElement} aria-label={`${model} saved queries`} onpointerdown={event => dismissActions(event.target)}>
  <header class="query-workspace-header">
    <div class="query-context"><h2 title={model}>{model}</h2><p>Saved query templates</p></div>
    <div class="query-actions"><Button variant="outline" onclick={() => showDialog('create')} disabled={readOnly}>New query</Button>
      <Button variant="outline" onclick={() => hasDirty && !anyPending && saveAll()} disabled={readOnly || !onSave} aria-disabled={!hasDirty || anyPending}>Save all</Button></div>
  </header>
  {#if catalog.error}<p role="alert" class="query-error">{catalog.error}</p>
  {:else}
    {#if globalError}<p role="alert" class="query-error">{globalError}</p>{/if}
    <div class="query-workspace-body">
      <aside class="query-explorer" aria-label="Saved queries">
        <label class="query-field"><span>Find a query</span><input type="search" bind:value={search} placeholder="Name or usage" disabled={!modelQueries.length} /></label>
        <div class="query-field"><label for={`${uid}-filter`}>Operation</label><select id={`${uid}-filter`} bind:value={filter} disabled={!modelQueries.length}><option value="">All operations</option>{#each QUERY_OPERATIONS as operation}<option value={operation}>{operation}</option>{/each}</select></div>
        <nav aria-label="Query usages">{#each visibleGroups as group (group.operation)}
          <section class="query-group" aria-labelledby={`${uid}-group-${group.operation}`}>
            <h3 id={`${uid}-group-${group.operation}`}><code>{group.operation}</code><span aria-hidden="true">{group.queries.length}</span></h3>
            <ul>{#each group.queries as query (query.id)}<li>
              <button type="button" class:active={query.id === activeId} onclick={() => select(query.id)} aria-current={query.id === activeId ? 'true' : undefined}>
                <span class="query-list-name">{query.name}{#if dirty(query)}<span class="query-dirty" aria-hidden="true">•</span><span class="query-sr-only">, unsaved changes</span>{/if}</span>
                <span class="query-list-usage">{query.usageKey}</span><span class="query-list-state" data-state={inspectTemplate(query, context).state}>{inspectTemplate(query, context).state}</span>
              </button>
            </li>{/each}</ul>
          </section>
        {/each}{#if visibleQueries.length === 0}<p class="query-empty-list">{modelQueries.length ? 'No matching queries.' : 'No saved queries yet.'}</p>{/if}</nav>
      </aside>
      <div class="query-workspace-main">
        <div class="query-mobile-selector query-field"><label for={`${uid}-selector`}>Saved query</label><select id={`${uid}-selector`} value={activeId} onchange={event => select(event.currentTarget.value)}>
          {#if !modelQueries.length}<option value="">No saved queries</option>{/if}
          {#each modelGroups as group (group.operation)}<optgroup label={group.operation}>{#each group.queries as query (query.id)}<option value={query.id}>{query.name} · {query.usageKey}{dirty(query) ? ' • unsaved' : ''}</option>{/each}</optgroup>{/each}
        </select></div>
        {#if active && currentState && parser}
          <div class="query-tabs-desktop"><QueryTabBar {tabs} {activeId} panelId={`${uid}-query-panel`} onselect={select} onrename={readOnly ? undefined : rename}
            onclose={id => { openIds = openIds.filter(open => open !== id); if (activeId === id) select(openIds[0] ?? modelQueries.find(query => query.id !== id)?.id ?? id); }} /></div>
          <div class="query-active-header">
            <div class="query-active-identity"><h3 title={active.name}>{active.name}</h3><p><code>{active.operation}</code><span> / </span><span title={active.usageKey}>{active.usageKey}</span></p></div>
            <div class="query-actions">{#if !readOnly}<details class="query-more-actions" bind:open={actionsOpen} bind:this={actionsElement} {@attach menuDismissal}><summary aria-label="Query actions">Actions</summary><div>
              <Button variant="ghost" onclick={() => showDialog('rename')} disabled={readOnly}>Rename</Button>
              <Button variant="ghost" onclick={() => showDialog('duplicate')} disabled={readOnly}>Duplicate</Button>
              <Button variant="ghost" onclick={() => showDialog('delete')} disabled={readOnly || pending[active.id] || (savedQueries.some(saved => saved.id === active.id) && !onDelete)}>Delete</Button></div></details>{/if}
              <Button onclick={() => active && dirty(active) && save(active)} disabled={readOnly || !onSave} aria-disabled={!dirty(active) || pending[active.id] || codeValid[active.id] === false}>{pending[active.id] ? 'Saving…' : 'Save query'}</Button></div>
          </div>
          <div class="query-statusbar">
            <span class="query-state" data-state={inspection?.state}>{inspection?.state ?? 'draft'}</span>
            <label><input type="checkbox" checked={active.enabled} disabled={readOnly} onchange={event => active && replace({ ...active, enabled: event.currentTarget.checked })} /> Enabled</label>
            <button type="button" onclick={() => active && accept(active)} disabled={readOnly || codeValid[active.id] === false}>{inspection?.state === 'stale' ? 'Review & accept' : active.accepted ? 'Reopen as draft' : 'Accept query'}</button>
            <button type="button" onclick={() => showDialog('link')} disabled={readOnly || !onLink || dirty(active)} title={dirty(active) ? 'Save this query before changing its usages.' : activeRoutes.join(', ')}>Used by {activeRoutes.length} {activeRoutes.length === 1 ? 'route' : 'routes'}</button>
            <span role="status" class="query-save-state">{pending[active.id] ? 'Saving snapshot…' : dirty(active) ? 'Unsaved changes' : messages[active.id]?.kind === 'success' ? messages[active.id].text || 'Saved' : 'Saved'}</span>
          </div>
          {#if readOnly}<p class="query-note">Read-only access. Queries can be inspected but not changed.</p>{:else if !onSave}<p class="query-note">Storage is not connected. Changes cannot be saved.</p>{/if}
          {#if messages[active.id]?.kind === 'error'}<p role="alert" class="query-error">{messages[active.id].text}</p>{/if}
          {#if inspection?.issues.length}<p role="alert" class="query-note query-issue">{issueText(inspection.issues[0])}</p>{/if}
          <div class="query-editing-area" role="tabpanel" id={`${uid}-query-panel`} aria-label={active.name}>
            {#key active.id}{@const queryId = active.id}<QueryEditor {parser} queryState={currentState} {readOnly} draft={drafts[active.id] ?? null}
              onstatechange={state => updateState(queryId, state)}
              ondraftchange={code => updateDraft(queryId, code)}
              onvaliditychange={valid => updateValidity(queryId, valid)} />{/key}
          </div>
        {:else}<div class="query-empty"><h3>No queries for {model}</h3><p>Create a query for a page or application usage.</p><Button onclick={() => showDialog('create')} disabled={readOnly}>Create query</Button></div>{/if}
      </div>
    </div>
  {/if}
</section>

{#if dialog}
  <dialog class="query-dialog" bind:this={dialogElement} oncancel={event => { event.preventDefault(); closeDialog(); }} aria-labelledby={`${uid}-dialog-title`}>
    <form onsubmit={submitDialog}>
      <h2 id={`${uid}-dialog-title`}>{dialog === 'rename' ? 'Rename query' : dialog === 'delete' ? 'Delete query?' : dialog === 'link' ? 'Application usages' : dialog === 'duplicate' ? 'Duplicate query' : 'New query'}</h2>
      {#if dialog === 'rename'}<label class="query-field"><span>Name</span><input required maxlength="512" bind:value={dialogName} /></label>
      {:else if dialog === 'create' || dialog === 'duplicate'}
        <label class="query-field"><span>Name</span><input required maxlength="512" bind:value={dialogName} /></label>
        <div class="query-field"><label for={`${uid}-usage`}>Usage key</label><input id={`${uid}-usage`} required maxlength="160" pattern="[a-z][a-z0-9]*(-[a-z0-9]+)*" title="Lowercase letters, digits and single hyphens, starting with a letter." aria-describedby={`${uid}-usage-hint`} autocapitalize="off" autocomplete="off" spellcheck="false" bind:value={dialogUsage} placeholder="company-dashboard" /><small id={`${uid}-usage-hint`}>Lowercase letters, digits and hyphens. Stable identity for this application usage.</small></div>
        <div class="query-field"><label for={`${uid}-operation`}>Operation</label><select id={`${uid}-operation`} bind:value={dialogOperation} disabled={dialog === 'duplicate'}>{#each QUERY_OPERATIONS as operation}<option value={operation}>{operation}</option>{/each}</select></div>
      {:else if dialog === 'delete'}
        <p>Delete “{dialogQuery?.name}”?{#if dialogQuery && dirty(dialogQuery)}{' '}Its unsaved edits will also be removed.{/if}</p>
        {#if bindings.some(binding => binding.queryId === dialogQuery?.id)}<p class="query-error">Unlink this query from its application usages before deleting it.</p>{/if}
      {:else if dialog === 'link'}
        <p>These server-registered routes will explicitly share this query. Other query variants remain separate.</p>
        {#each linkable as route}<label class="query-route"><input type="checkbox" value={route.id} bind:group={dialogRoutes} /><span>{route.label}<small>{route.id}</small></span></label>{/each}
        {#if !linkable.length}<p>No compatible, unassigned routes are available.</p>{/if}
      {/if}
      {#if dialogError}<p class="query-error" role="alert">{dialogError}</p>{/if}
      <div class="query-dialog-actions"><Button type="button" variant="outline" onclick={closeDialog} disabled={dialogPending}>Cancel</Button><Button type="submit" variant={dialog === 'delete' ? 'destructive' : 'default'} disabled={dialogPending || (dialog === 'delete' && bindings.some(binding => binding.queryId === dialogQuery?.id))}>{dialogPending ? 'Saving…' : dialog === 'delete' ? 'Delete query' : dialog === 'link' ? 'Save usages' : dialog === 'rename' ? 'Rename query' : 'Create query'}</Button></div>
    </form>
  </dialog>
{/if}
