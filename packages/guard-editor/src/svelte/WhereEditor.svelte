<script lang="ts">
  import type { Capabilities, SchemaDescriptor, WhereRule } from '../core/types.js';
  import type { RuleChoice } from './types.js';
  import { capabilityFor } from '../core/capabilities.js';
  import { modelFor } from '../core/schema.js';
  import { sorted } from '../core/json.js';
  import Choice from './Choice.svelte';
  import RuleControl from './RuleControl.svelte';
  import WhereEditor from './WhereEditor.svelte';
  let { schema, capabilities, model, value, unique = false, depth = 0, disabled = false, onChange }: {
    schema: SchemaDescriptor; capabilities: Capabilities; model: string; value: WhereRule[];
    unique?: boolean; depth?: number; disabled?: boolean; onChange: (value: WhereRule[]) => void;
  } = $props();
  const uid = $props.id();
  let open = $state<string | null>(null);
  let descriptor = $derived(modelFor(schema, model));
  let cap = $derived(capabilityFor(capabilities, model));
  let fieldNames = $derived(sorted([...new Set([
    ...(!unique ? cap.where.map(entry => entry.field) : []),
    ...cap.forced.filter(entry => entry.targets.includes('where')).map(entry => entry.field),
  ])], entry => entry));
  function replace(field: string, next: WhereRule | null) {
    if (!disabled) onChange([...value.filter(entry => entry.field !== field), ...(next ? [next] : [])]);
  }
  function choice(rule: WhereRule | undefined): RuleChoice {
    return rule?.kind === 'forced' ? { kind: 'forced', value: rule.value } : rule?.kind === 'scalar' ? { kind: 'client' } : null;
  }
</script>

<div class="guard-tree">
  {#if !fieldNames.length}<p class="guard-hint">No {unique ? 'forced predicates' : 'scalar filters'} are exposed.</p>{/if}
  {#each fieldNames as fieldName (fieldName)}
    {@const field = descriptor.fields.find(field => field.name === fieldName)}
    {@const current = value.find(entry => entry.field === fieldName)}
    {@const forced = cap.forced.find(entry => entry.field === fieldName && entry.targets.includes('where'))}
    {@const filter = cap.where.find(entry => entry.field === fieldName)}
    {#if field?.kind === 'scalar' || field?.kind === 'enum'}
      <fieldset class="guard-field-group">
        <legend>{fieldName} <span class="guard-hint">{field.type}{field.list ? '[]' : ''}</span></legend>
        {#if forced}
          <RuleControl label={`Forced predicate for ${fieldName}`} value={choice(current)} {field} allowClient={false}
            allowLiteral={forced.literals} sources={capabilities.sources.filter(source => forced.sources.includes(source.name))} {disabled}
            onChange={(next) => replace(fieldName, next?.kind === 'forced' ? { kind: 'forced', field: fieldName, value: next.value } : null)} />
        {/if}
        {#if !unique && filter}
          <p class="guard-hint">Allowed client operators. Selecting an operator replaces a forced value for this field.</p>
          <div class="guard-choices">
            {#each filter.operators as operator (operator)}
              <Choice label={`${fieldName}: ${operator}`} checked={current?.kind === 'scalar' && current.operators.includes(operator)} {disabled}
                onChange={(checked) => {
                  const operators = current?.kind === 'scalar' ? current.operators.filter(entry => entry !== operator) : [];
                  if (checked) operators.push(operator);
                  replace(fieldName, operators.length ? { kind: 'scalar', field: fieldName, operators } : null);
                }} />
            {/each}
          </div>
        {/if}
      </fieldset>
    {/if}
  {/each}
  {#if !unique && depth < capabilities.maxRelationDepth}
    {#each cap.relations.filter(relation => relation.where.length) as relation (relation.field)}
      {@const field = descriptor.fields.find(field => field.name === relation.field)}
      {@const current = value.find(entry => entry.kind === 'relation' && entry.field === relation.field)}
      {#if field?.kind === 'relation'}
        <div class="guard-relation">
          <button type="button" class="guard-relation-toggle" aria-expanded={open === field.name} aria-controls={`${uid}-${field.name}`}
            onclick={() => { open = open === field.name ? null : field.name; }}>
            Filter {field.name} → {field.model} · {current?.kind === 'relation' ? `${current.branches.length} branches` : 'Not allowed'}
          </button>
          {#if open === field.name}
            <div id={`${uid}-${field.name}`} class="guard-relation-body">
              {#each relation.where as operator (operator)}
                {@const branch = current?.kind === 'relation' ? current.branches.find(branch => branch.operator === operator) : undefined}
                <fieldset class="guard-field-group"><legend>{field.name}: {operator}</legend>
                  {#if operator === 'none' || operator === 'isNot'}<p class="guard-hint">Forced predicates are refused under negative relation operators.</p>{/if}
                  <WhereEditor {schema} {capabilities} model={field.model} value={branch?.where ?? []} depth={depth + 1} {disabled}
                    onChange={(where) => {
                      const branches = current?.kind === 'relation' ? current.branches.filter(branch => branch.operator !== operator) : [];
                      if (where.length) branches.push({ operator, where });
                      replace(field.name, branches.length ? { kind: 'relation', field: field.name, branches } : null);
                    }} />
                </fieldset>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  {/if}
</div>
