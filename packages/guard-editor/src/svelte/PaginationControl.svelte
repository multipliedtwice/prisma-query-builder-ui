<script lang="ts">
  import type { Pagination } from '../core/types.js';
  let { value, max, disabled = false, label, onChange }: {
    value: Pagination; max: number; disabled?: boolean; label: string;
    onChange: (value: Pagination) => void;
  } = $props();
  const uid = $props.id();
  let defaultDraft = $state('');
  let maxDraft = $state('');
  let error = $state('');
  let signature = $derived(`${value.default}:${value.max}:${max}:${disabled}`);
  $effect(() => {
    const parts = signature.split(':');
    defaultDraft = parts[0];
    maxDraft = parts[1];
    error = '';
  });
  function change(part: 'default' | 'max', text: string) {
    if (disabled) return;
    if (part === 'default') defaultDraft = text; else maxDraft = text;
    const next = { default: Number(defaultDraft), max: Number(maxDraft) };
    if (!/^\d+$/.test(defaultDraft) || !/^\d+$/.test(maxDraft) || !Number.isSafeInteger(next.default) || !Number.isSafeInteger(next.max) || next.default < 1 || next.max < next.default || next.max > max) {
      error = `Use whole numbers: 1 ≤ default ≤ maximum ≤ ${max}. The policy has not changed.`;
      return;
    }
    error = '';
    defaultDraft = String(value.default);
    maxDraft = String(value.max);
    onChange(next);
  }
</script>

<div class="guard-bounds" role="group" aria-label={label}>
  <label for={`${uid}-default`}>Default page size
    <input id={`${uid}-default`} type="number" inputmode="numeric" min="1" max={max} step="1"
      value={defaultDraft} {disabled} aria-invalid={error ? true : undefined} aria-describedby={`${uid}-error`}
      oninput={(event) => { change('default', event.currentTarget.value); event.currentTarget.value = defaultDraft; }} />
  </label>
  <label for={`${uid}-max`}>Maximum page size
    <input id={`${uid}-max`} type="number" inputmode="numeric" min="1" max={max} step="1"
      value={maxDraft} {disabled} aria-invalid={error ? true : undefined} aria-describedby={`${uid}-error`}
      oninput={(event) => { change('max', event.currentTarget.value); event.currentTarget.value = maxDraft; }} />
  </label>
  <p id={`${uid}-error`} class="guard-error" aria-live="polite">{error}</p>
</div>
