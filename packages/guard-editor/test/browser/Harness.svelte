<script lang="ts">
  import GuardShapeBuilder from '../../src/svelte/GuardShapeBuilder.svelte';
  import { OPERATIONS, readSchema, readCapabilities } from '../../src/core/index.js';
  import type { GuardPolicy, Operation } from '../../src/core/types.js';
  import { freshContext, policy } from '../fixtures/context.mjs';

  const fixture = freshContext();
  const longName = `field_${'long_name_'.repeat(25)}`;
  fixture.schema.models.find(model => model.name === 'User')?.fields.push({
    name: longName, kind: 'scalar', type: 'String', list: false, nullable: true, writable: true, hasDefault: false,
  });
  fixture.capabilities.models.find(model => model.model === 'User')?.select.push(longName);
  const schema = readSchema(fixture.schema);
  const capabilities = readCapabilities(fixture.capabilities, schema);
  let operation: Operation = $state('findMany');
  let current: unknown = $state(policy());
  let readOnly = $state(false);
  let accept = $state(true);
  let changes = $state(0);
  let activeCapabilities = $state(capabilities);
  function receive(next: GuardPolicy) { changes += 1; if (accept) current = next; }
  function chooseOperation(value: string) {
    const next = OPERATIONS.find(operation => operation === value);
    if (next) { operation = next; current = policy(next); }
  }
  function staleCapability() {
    const next = structuredClone(capabilities);
    const cap = next.models.find(model => model.model === 'User');
    if (cap) cap.select = cap.select.filter(field => field !== 'id');
    activeCapabilities = next;
  }
</script>

<main>
  <div class="harness-controls">
    <button type="button" onclick={() => { readOnly = !readOnly; }}>Toggle read-only</button>
    <button type="button" onclick={() => { accept = !accept; }}>Toggle parent acceptance</button>
    <button type="button" onclick={() => { current = { ...policy(operation), unknown: true }; }}>Supply invalid policy</button>
    <button type="button" onclick={() => { current = policy(operation); activeCapabilities = capabilities; }}>Restore valid policy</button>
    <button type="button" onclick={staleCapability}>Narrow capabilities</button>
    <button type="button" onclick={() => { operation = 'delete'; }}>Change identity only</button>
    <label>Operation fixture
      <select value={operation} onchange={(event) => chooseOperation(event.currentTarget.value)}>
        {#each OPERATIONS as entry}<option value={entry}>{entry}</option>{/each}
      </select>
    </label>
    <output data-testid="change-count" aria-label="Change callbacks">{changes}</output>
    <output data-testid="acceptance">{accept ? 'accepting' : 'holding'}</output>
  </div>
  <GuardShapeBuilder {schema} model="User" {operation} policy={current} capabilities={activeCapabilities} {readOnly} onChange={receive} />
</main>

<style>
  :global(body) { margin: 0; font-family: system-ui, sans-serif; background: white; color: #171717; }
  main { padding: 16px; width: 100%; box-sizing: border-box; }
  .harness-controls { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 16px; }
  .harness-controls button, .harness-controls select { min-height: 44px; max-width: 100%; }
  .harness-controls output { min-width: 32px; }
</style>
