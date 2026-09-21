<script lang="ts">
  import type { GuardPolicy } from '../core/types.js';
  import type { GuardShapeBuilderProps } from './types.js';
  import { canonicalJson, resultOf } from '../core/json.js';
  import { capabilityFor } from '../core/capabilities.js';
  import { modelFor } from '../core/schema.js';
  import { isMany, isUnique } from '../core/policy.js';
  import { inspectEditorPolicy, proposePolicyChange } from '../core/editor.js';
  import { compilePolicy, previewCompiledPolicy } from '../core/compiler.js';
  import Choice from './Choice.svelte';
  import ProjectionEditor from './ProjectionEditor.svelte';
  import WhereEditor from './WhereEditor.svelte';
  import DataEditor from './DataEditor.svelte';
  import PaginationControl from './PaginationControl.svelte';
  import './styles.css';

  let { schema, model, operation, policy, capabilities, readOnly = false, onChange }: GuardShapeBuilderProps = $props();
  const uid = $props.id();
  let error = $state('');
  let context = $derived({ schema, capabilities });
  let view = $derived(inspectEditorPolicy(policy, context, model, operation));
  let preview = $derived.by(() => {
    const current = view;
    return current.ok ? resultOf(() => previewCompiledPolicy(compilePolicy(current.value, context))) : null;
  });
  $effect(() => { view; error = ''; });
  function update(candidate: GuardPolicy) {
    if (readOnly || !view.ok) return;
    const result = proposePolicyChange(policy, candidate, context, model, operation, readOnly);
    if (!result.ok) { error = result.issues.map(issue => `${issue.path}: ${issue.message}`).join(' '); return; }
    error = '';
    onChange(result.value);
  }
</script>

<section class="guard-shape-builder" aria-labelledby={`${uid}-title`}>
  <header class="guard-header">
    <h2 id={`${uid}-title`}>Guard policy · {model} · {operation}</h2>
    <p class="guard-hint">Edit the allowed query and data shape. This editor does not run queries or save policy.</p>
    {#if readOnly}<p class="guard-status">Read-only policy</p>{/if}
  </header>
  {#if !view.ok}
    <div class="guard-refusal" role="alert">
      <h3>Policy refused</h3>
      {#each view.issues as issue}<p>{issue.path}: {issue.message}</p>{/each}
      <p>The supplied value has not been changed. The consumer must supply valid policy, schema and capabilities.</p>
    </div>
  {:else}
    {@const current = view.value}
    {@const cap = capabilityFor(capabilities, model)}
    {@const descriptor = modelFor(schema, model)}
    <div class="guard-change-error" id={`${uid}-error`} role="status" aria-live="polite">
      {#if error}<strong>Change refused.</strong> {error}{/if}
    </div>
    {#key `${model}:${operation}`}
    <div class="guard-layout">
      <div class="guard-controls" aria-describedby={`${uid}-error`}>
        <fieldset class="guard-section">
          <legend>Operation</legend>
          <Choice label="Enable operation" checked={current.enabled} disabled={readOnly} errorId={`${uid}-error`}
            onChange={(enabled) => update({ ...current, enabled })} />
          {#if !current.enabled}<p class="guard-hint">Disabled. Configure the rules before enabling. Disabled policies produce no executable guard shape.</p>{/if}
        </fieldset>
        <fieldset class="guard-section">
          <legend>Return projection</legend>
          <p class="guard-hint">Only explicitly selected fields may be returned. Consumers must enable prisma-guard's enforceProjection option.</p>
          <ProjectionEditor {schema} {capabilities} {model} value={current.select} disabled={readOnly}
            onChange={(select) => update({ ...current, select })} />
        </fieldset>
        {#if isUnique(operation)}
          <fieldset class="guard-section"><legend>Unique selectors</legend>
            <p class="guard-hint">Each selected constraint is complete. Partial compound selectors are not allowed.</p>
            {#if !cap.unique.length}<p class="guard-hint">No unique selectors are exposed.</p>{/if}
            {#each cap.unique as selector (selector)}
              {@const fields = descriptor.uniqueSelectors.find(entry => entry.name === selector)?.fields ?? []}
              <Choice label={fields.length > 1 ? `${selector} (${fields.join(', ')})` : selector} checked={current.unique.includes(selector)} disabled={readOnly}
                onChange={(checked) => update({ ...current, unique: [...current.unique.filter(entry => entry !== selector), ...(checked ? [selector] : [])] })} />
            {/each}
          </fieldset>
        {/if}
        {#if operation !== 'create'}
          <fieldset class="guard-section"><legend>{isUnique(operation) ? 'Forced predicates' : 'Filters and operators'}</legend>
            <WhereEditor {schema} {capabilities} {model} value={current.where} unique={isUnique(operation)} disabled={readOnly}
              onChange={(where) => update({ ...current, where })} />
          </fieldset>
        {/if}
        {#if operation === 'create' || operation === 'update'}
          <fieldset class="guard-section"><legend>Writable data</legend>
            <p class="guard-hint">Fields are denied unless explicitly client-controlled or forced. Nested relation writes are not supported.</p>
            <DataEditor {schema} {capabilities} {model} {operation} value={current.data} disabled={readOnly}
              onChange={(data) => update({ ...current, data })} />
          </fieldset>
        {/if}
        {#if isMany(operation)}
          <fieldset class="guard-section"><legend>Ordering</legend>
            {#if !cap.orderBy.length}<p class="guard-hint">No ordering fields are exposed.</p>{/if}
            <div class="guard-choices">
              {#each cap.orderBy as field (field)}
                <Choice label={`Order by ${field}`} checked={current.orderBy.includes(field)} disabled={readOnly}
                  onChange={(checked) => update({ ...current, orderBy: [...current.orderBy.filter(entry => entry !== field), ...(checked ? [field] : [])] })} />
              {/each}
            </div>
          </fieldset>
          <fieldset class="guard-section"><legend>Pagination</legend>
            <Choice label="Allow skip" checked={current.skip} disabled={readOnly || !capabilities.pagination.allowSkip}
              onChange={(skip) => update({ ...current, skip })} />
            {#if !capabilities.pagination.allowSkip}<p class="guard-hint">Skip is disabled by the consumer.</p>{/if}
            {#if current.take}
              <PaginationControl value={current.take} max={capabilities.pagination.max} disabled={readOnly} label="Operation pagination"
                onChange={(take) => update({ ...current, take })} />
            {:else}
              <p class="guard-hint">An enabled list operation needs a positive default and maximum page size.</p>
              <button type="button" disabled={readOnly} onclick={() => update({ ...current, take: { default: 1, max: capabilities.pagination.max } })}>
                Set default 1, maximum {capabilities.pagination.max}
              </button>
            {/if}
          </fieldset>
        {/if}
        <p class="guard-hint">{capabilities.maxRelationDepth === 0 ? 'Relation traversal is disabled.' : `Relation traversal is limited to ${capabilities.maxRelationDepth} levels and explicitly exposed relations.`}</p>
      </div>
      <aside class="guard-previews" aria-label="Policy previews">
        <section class="guard-preview"><h3>JSON policy</h3><textarea class="guard-preview-code" readonly aria-label="JSON policy preview" value={canonicalJson(current)}></textarea></section>
        <section class="guard-preview"><h3>Compiled guard shape</h3>
          <p class="guard-hint">Display only. $force represents prisma-guard's runtime force marker; this preview is not an executable JSON shape.</p>
          {#if preview?.ok}<textarea class="guard-preview-code" readonly aria-label="Compiled guard shape preview" value={preview.value}></textarea>
          {:else if preview && !preview.ok}<p class="guard-notice" role="status">{preview.issues.map(issue => issue.message).join(' ')} Named sources are never resolved by this editor.</p>{/if}
        </section>
      </aside>
    </div>
    {/key}
  {/if}
</section>
