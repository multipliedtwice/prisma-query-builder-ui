<script lang="ts">
  import type { NamedSource, ValueField } from '../core/types.js';
  import type { RuleChoice } from './types.js';
  import { canonicalJson, parseJson, resultOf } from '../core/json.js';
  import { validateLiteral } from '../core/policy.js';
  let { label, value, field, allowClient, allowLiteral, sources, disabled = false, onChange }: {
    label: string; value: RuleChoice; field: ValueField; allowClient: boolean;
    allowLiteral: boolean; sources: NamedSource[]; disabled?: boolean;
    onChange: (choice: RuleChoice) => void;
  } = $props();
  const uid = $props.id();
  let editingLiteral = $state(false);
  let draft = $state('');
  let error = $state('');
  let mode = $derived(value === null ? 'none' : value.kind === 'client' ? 'client' : value.value.kind === 'literal' ? 'literal' : `source:${value.value.name}`);
  let signature = $derived(canonicalJson(value));
  $effect(() => {
    const current = parseJson(signature);
    editingLiteral = false;
    error = '';
    draft = current !== null && typeof current === 'object' && !Array.isArray(current) && current.kind === 'forced' &&
      current.value !== null && typeof current.value === 'object' && !Array.isArray(current.value) && current.value.kind === 'literal'
      ? canonicalJson(current.value.value) : '';
  });
  function choose(next: string) {
    if (disabled) return;
    error = '';
    if (next === 'literal') { editingLiteral = true; return; }
    editingLiteral = false;
    if (next === 'none') onChange(null);
    else if (next === 'client' && allowClient) onChange({ kind: 'client' });
    else {
      const source = sources.find(source => `source:${source.name}` === next);
      if (source) onChange({ kind: 'forced', value: { kind: 'source', name: source.name } });
    }
  }
  function applyLiteral() {
    if (disabled || !allowLiteral) return;
    const parsed = resultOf(() => validateLiteral(parseJson(draft), field, '$literal'));
    if (!parsed.ok) { error = parsed.issues.map(issue => issue.message).join(' '); return; }
    error = '';
    onChange({ kind: 'forced', value: { kind: 'literal', value: parsed.value } });
  }
</script>

<div class="guard-rule-control">
  <label for={`${uid}-mode`}>{label}</label>
  <select id={`${uid}-mode`} value={mode} {disabled} onchange={(event) => {
    const next = event.currentTarget.value;
    event.currentTarget.value = mode;
    choose(next);
  }}>
    <option value="none">Not allowed</option>
    {#if allowClient || mode === 'client'}<option value="client" disabled={!allowClient}>{allowClient ? 'Client-controlled' : 'Client filters below'}</option>{/if}
    {#if allowLiteral}<option value="literal">Forced JSON literal</option>{/if}
    {#each sources as source (source.name)}<option value={`source:${source.name}`}>{source.label}</option>{/each}
  </select>
  {#if allowLiteral && (editingLiteral || mode === 'literal')}
    <label for={`${uid}-literal`}>JSON literal for {field.name}</label>
    <textarea id={`${uid}-literal`} rows="3" value={draft} {disabled} spellcheck="false"
      aria-invalid={error ? true : undefined} aria-describedby={`${uid}-help ${uid}-error`}
      oninput={(event) => { draft = event.currentTarget.value; }}></textarea>
    <p id={`${uid}-help`} class="guard-hint">JSON data only. Apply validates the value before asking the consumer to accept it.</p>
    <button type="button" {disabled} onclick={applyLiteral}>Apply literal</button>
  {/if}
  <p id={`${uid}-error`} class="guard-error" aria-live="polite">{error}</p>
</div>
