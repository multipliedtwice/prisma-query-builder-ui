<script lang="ts">
  import ArgTree from './ArgTree.svelte';
  import CodePreview from './CodePreview.svelte';
  import SplitView from '../../packages/guard-editor/src/svelte/primitives/SplitView.svelte';
  import { clonePayload, setValue, valueAt } from '../../packages/guard-editor/src/query/payload.js';
  import type { Payload, PayloadValue, QuerySchema, QueryState } from '../../packages/guard-editor/src/query/types.js';
  let { parser, queryState, onstatechange, readOnly = false, draft = null, ondraftchange, onvaliditychange, onrun,
    usePrismaSql = $bindable(false), hasWorkspace = false, isEmbedded = false, embeddedHasDatabase = false }: {
    parser: QuerySchema; queryState: QueryState; onstatechange: (state: QueryState) => void; readOnly?: boolean;
    draft?: string | null; ondraftchange?: ((value: string | null) => void) | undefined; onvaliditychange?: ((valid: boolean) => void) | undefined;
    onrun?: (() => void) | undefined; usePrismaSql?: boolean; hasWorkspace?: boolean; isEmbedded?: boolean; embeddedHasDatabase?: boolean;
  } = $props();
  let mobilePane = $state<'builder' | 'preview'>('builder');
  let staged: QueryState | null = null;
  const current = () => staged ?? queryState;
  function publish(next: QueryState) {
    staged = next;
    onstatechange(next);
    queueMicrotask(() => { if (staged === next) staged = null; });
  }
  function update(payload: Payload, path = current().path, fromTree = true) {
    if (readOnly) return;
    if (fromTree) { ondraftchange?.(null); onvaliditychange?.(true); }
    publish({ ...current(), path, payload: clonePayload(payload) });
  }
  function open(arg: string | string[], initial: PayloadValue = {}) {
    const path = [...current().path, ...(typeof arg === 'string' ? [arg] : arg)];
    const existing = valueAt(current().payload, path);
    if (existing !== undefined || readOnly) publish({ ...current(), path });
    else update(setValue(current().payload, path, initial), path);
  }
  function addArray(path: string[]) {
    const value = valueAt(current().payload, path);
    update(setValue(current().payload, path, [...(Array.isArray(value) ? value : []), {}]));
  }
  function removeArray(path: string[], index: number) {
    const value = valueAt(current().payload, path);
    if (!Array.isArray(value) || value.length < 2) return;
    const next = value.filter((_, at) => at !== index);
    update(setValue(current().payload, path, next), [...path, String(Math.max(0, Math.min(index, next.length - 1)))]);
  }
</script>

<div class="query-editor">
  <div class="query-mobile-panes" role="group" aria-label="Query view">
    <button type="button" aria-pressed={mobilePane === 'builder'} onclick={() => mobilePane = 'builder'}>Builder</button>
    <button type="button" aria-pressed={mobilePane === 'preview'} onclick={() => mobilePane = 'preview'}>Prisma query</button>
  </div>
  <SplitView {mobilePane}>
    {#snippet builder()}
      {#if queryState.operation}
        <div class="query-tree">
          <ArgTree operation={queryState.operation} {parser} {queryState} {readOnly} onaddarg={open}
            ontogglefield={({ field, value }) => update(setValue(current().payload, [...current().path, field], value))}
            onbreadcrumbclick={index => publish({ ...current(), path: current().path.slice(0, index + 1) })}
            onaddarrayitem={addArray} onremovearrayitem={removeArray} />
        </div>
      {:else}<p class="p-8 text-muted-foreground">Select an operation to start building your query.</p>{/if}
    {/snippet}
    {#snippet preview()}
      <CodePreview {queryState} {readOnly} {draft} {ondraftchange} {onvaliditychange} {onrun}
        oneditpayload={payload => update(payload, current().path, false)} bind:usePrismaSql {hasWorkspace} {isEmbedded} {embeddedHasDatabase} />
    {/snippet}
  </SplitView>
</div>

<style>
  .query-editor { container: query-editor / inline-size; position: relative; min-height: 0; min-width: 0; height: 100%; display: flex; flex-direction: column; }
  .query-tree { height: 100%; min-width: 0; }
  .query-mobile-panes { display: none; }
  @container query-editor (max-width: 559px) {
    .query-mobile-panes { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .query-mobile-panes button { min-height: 44px; flex: 1; font-size: .875rem; }
    .query-mobile-panes button[aria-pressed='true'] { background: var(--accent); font-weight: 600; }
  }
</style>
