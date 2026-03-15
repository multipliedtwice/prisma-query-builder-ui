<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import { Upload, Loader2 } from "@lucide/svelte";

  let {
    onworkspacecreated
  }: {
    onworkspacecreated: (workspaceId: string, name: string) => void;
  } = $props();

  let uploading = $state(false);
  let error = $state<string | null>(null);
  let fileInput: HTMLInputElement;

  async function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    uploading = true;
    error = null;

    try {
      const formData = new FormData();
      formData.append("schema", file);

      const response = await fetch("/api/workspace/create", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any).error || "Upload failed");
      }

      const data = await response.json();
      onworkspacecreated(data.workspaceId, data.name ?? "");
      target.value = "";
    } catch (e) {
      error = e instanceof Error ? e.message : "Upload failed";
    } finally {
      uploading = false;
    }
  }
</script>

<div class="flex flex-col gap-2">
  <input
    type="file"
    accept=".prisma"
    class="hidden"
    bind:this={fileInput}
    onchange={handleFileSelect}
    disabled={uploading}
  />

  <Button
    variant="outline"
    size="sm"
    onclick={() => fileInput.click()}
    disabled={uploading}
  >
    {#if uploading}
      <Loader2 class="h-4 w-4 mr-2 animate-spin" />
      Creating workspace...
    {:else}
      <Upload class="h-4 w-4 mr-2" />
      Upload Schema
    {/if}
  </Button>

  {#if error}
    <span class="text-sm text-destructive">{error}</span>
  {/if}
</div>
