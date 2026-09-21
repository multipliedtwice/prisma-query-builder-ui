<script lang="ts">
  import type { Capabilities, DataRule, SchemaDescriptor } from '../core/types.js';
  import { capabilityFor } from '../core/capabilities.js';
  import { modelFor } from '../core/schema.js';
  import { sorted } from '../core/json.js';
  import RuleControl from './RuleControl.svelte';
  let { schema, capabilities, model, operation, value, disabled = false, onChange }: {
    schema: SchemaDescriptor; capabilities: Capabilities; model: string; operation: 'create' | 'update';
    value: DataRule[]; disabled?: boolean; onChange: (value: DataRule[]) => void;
  } = $props();
  let descriptor = $derived(modelFor(schema, model));
  let cap = $derived(capabilityFor(capabilities, model));
  let fieldNames = $derived(sorted([...new Set([...cap[operation], ...cap.forced.filter(entry => entry.targets.includes(operation)).map(entry => entry.field)])], entry => entry));
</script>

<div class="guard-tree">
  {#if !fieldNames.length}<p class="guard-hint">No writable fields are exposed.</p>{/if}
  {#each fieldNames as fieldName (fieldName)}
    {@const field = descriptor.fields.find(field => field.name === fieldName)}
    {@const current = value.find(entry => entry.field === fieldName)}
    {@const forced = cap.forced.find(entry => entry.field === fieldName && entry.targets.includes(operation))}
    {#if field?.kind === 'scalar' || field?.kind === 'enum'}
      <fieldset class="guard-field-group"><legend>{fieldName} <span class="guard-hint">{field.type}{field.list ? '[]' : ''}</span></legend>
        <RuleControl label={`Data rule for ${fieldName}`} value={current?.kind === 'forced' ? { kind: 'forced', value: current.value } : current ? { kind: 'client' } : null}
          {field} allowClient={cap[operation].includes(fieldName)} allowLiteral={forced?.literals ?? false}
          sources={capabilities.sources.filter(source => forced?.sources.includes(source.name))} {disabled}
          onChange={(next) => {
            if (!disabled) onChange([...value.filter(entry => entry.field !== fieldName), ...(next === null ? [] :
              next.kind === 'client' ? [{ kind: 'client' as const, field: fieldName }] : [{ kind: 'forced' as const, field: fieldName, value: next.value }])]);
          }} />
      </fieldset>
    {/if}
  {/each}
</div>
