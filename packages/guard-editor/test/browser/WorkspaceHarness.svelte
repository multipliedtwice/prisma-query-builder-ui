<script lang="ts">
  import SavedQueryWorkspace from '../../src/svelte/SavedQueryWorkspace.svelte';
  import WorkspaceFixture from './WorkspaceFixture.svelte';
  import type { SavedQueryTemplate } from '../../src/templates/types.js';
  const options = new URLSearchParams(location.search);
  const readOnly = options.has('readonly');
  const delayed = options.has('pending-save');
  async function save(query: SavedQueryTemplate, callback: ((query: SavedQueryTemplate) => Promise<SavedQueryTemplate>) | undefined) {
    if (!callback) throw new Error('Save is not connected.');
    if (delayed) await new Promise(resolve => setTimeout(resolve, 1500));
    return callback(query);
  }
</script>
<main style="height: 100dvh; min-width: 0; padding: 16px; box-sizing: border-box;">
  <WorkspaceFixture>{#snippet children(props)}<SavedQueryWorkspace {...props} {readOnly} onSave={query => save(query, props.onSave)} />{/snippet}</WorkspaceFixture>
</main>
