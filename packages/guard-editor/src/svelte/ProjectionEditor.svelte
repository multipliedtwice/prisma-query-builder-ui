<script lang="ts">
  import type { Capabilities, SchemaDescriptor, Selection } from '../core/types.js';
  import { capabilityFor } from '../core/capabilities.js';
  import { modelFor } from '../core/schema.js';
  import Choice from './Choice.svelte';
  import PaginationControl from './PaginationControl.svelte';
  import ProjectionEditor from './ProjectionEditor.svelte';
  let { schema, capabilities, model, value, depth = 0, disabled = false, onChange }: {
    schema: SchemaDescriptor; capabilities: Capabilities; model: string; value: Selection[];
    depth?: number; disabled?: boolean; onChange: (value: Selection[]) => void;
  } = $props();
  const uid = $props.id();
  let open = $state<string | null>(null);
  let descriptor = $derived(modelFor(schema, model));
  let cap = $derived(capabilityFor(capabilities, model));
  function replace(field: string, next: Selection | null) {
    if (!disabled) onChange([...value.filter(entry => entry.field !== field), ...(next ? [next] : [])]);
  }
</script>

<div class="guard-tree">
  {#if !cap.select.length && !cap.relations.some(relation => relation.select)}<p class="guard-hint">No projection fields are exposed for this model.</p>{/if}
  <div class="guard-choices">
    {#each cap.select as field (field)}
      <Choice label={field} checked={value.some(entry => entry.field === field)} {disabled}
        onChange={(checked) => replace(field, checked ? { kind: 'field', field } : null)} />
    {/each}
  </div>
  {#if depth < capabilities.maxRelationDepth}
    {#each cap.relations.filter(relation => relation.select) as relation (relation.field)}
      {@const field = descriptor.fields.find(field => field.name === relation.field)}
      {@const selected = value.find(entry => entry.kind === 'relation' && entry.field === relation.field)}
      {#if field?.kind === 'relation'}
        <div class="guard-relation">
          <button type="button" class="guard-relation-toggle" aria-expanded={open === field.name} aria-controls={`${uid}-${field.name}`}
            onclick={() => { open = open === field.name ? null : field.name; }}>
            {field.name} → {field.model} · {selected?.kind === 'relation' ? `${selected.select.length} selected` : 'Not selected'}
          </button>
          {#if open === field.name}
            <div id={`${uid}-${field.name}`} class="guard-relation-body">
              <p class="guard-hint">Relation depth {depth + 1} of {capabilities.maxRelationDepth}. Select individual return fields.</p>
              {#if field.list}
                <p class="guard-hint">New relation selections use default 1 and maximum {capabilities.pagination.max}. Adjust after selecting a field.</p>
                {#if selected?.kind === 'relation' && selected.take}
                  <PaginationControl value={selected.take} max={capabilities.pagination.max} {disabled} label={`${field.name} pagination`}
                    onChange={(take) => replace(field.name, { ...selected, take })} />
                {/if}
              {/if}
              <ProjectionEditor {schema} {capabilities} model={field.model} depth={depth + 1} {disabled}
                value={selected?.kind === 'relation' ? selected.select : []}
                onChange={(select) => replace(field.name, select.length ? { kind: 'relation', field: field.name, select,
                  take: field.list ? (selected?.kind === 'relation' ? selected.take : { default: 1, max: capabilities.pagination.max }) : null } : null)} />
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  {/if}
</div>
