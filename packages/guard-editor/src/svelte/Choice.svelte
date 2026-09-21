<script lang="ts">
  let { label, checked, disabled = false, errorId, onChange }: {
    label: string; checked: boolean; disabled?: boolean; errorId?: string;
    onChange: (checked: boolean) => void;
  } = $props();
  const uid = $props.id();
</script>

<label class="guard-choice" for={uid}>
  <input id={uid} type="checkbox" {checked} {disabled} aria-describedby={errorId}
    onchange={(event) => {
      const next = event.currentTarget.checked;
      event.currentTarget.checked = checked;
      if (!disabled) onChange(next);
    }} />
  <span>{label}</span>
</label>
