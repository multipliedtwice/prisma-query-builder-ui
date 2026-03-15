<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as FileDropZone from "$lib/components/ui/file-drop-zone/index.js";
  import { Loader, Upload } from "@lucide/svelte";

  let {
    workspaceName = $bindable(""),
    databaseUrl = $bindable(""),
    uploading = false,
    error = null,
    onsubmit,
    submitLabel = "Create Workspace"
  }: {
    workspaceName?: string;
    databaseUrl?: string;
    uploading?: boolean;
    error?: string | null;
    onsubmit: (name: string, file: File, databaseUrl: string | null) => void | Promise<void>;
    submitLabel?: string;
  } = $props();

  let fileInput = $state<HTMLInputElement | null>(null);
  let selectedFile = $state<File | null>(null);

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;
    
    const file = files[0];
    
    if (!file.name.endsWith('.prisma')) {
      error = 'Please upload a .prisma file';
      return;
    }
    
    selectedFile = file;
    if (!workspaceName) {
      workspaceName = file.name.replace(".prisma", "");
    }
  };

  const handleFileRejected = ({ reason, file }: { reason: FileDropZone.FileRejectedReason; file: File }) => {
    error = `${file.name} rejected: ${reason}`;
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    await onsubmit(
      workspaceName || selectedFile.name.replace(".prisma", ""),
      selectedFile,
      databaseUrl.trim() ? databaseUrl.trim() : null
    );
  };
</script>

<div class="space-y-4">
  <div class="space-y-2">
    <Label for="workspace-name">Workspace Name</Label>
    <Input
      id="workspace-name"
      type="text"
      placeholder="My Schema"
      bind:value={workspaceName}
      disabled={uploading}
    />
  </div>

  <div class="space-y-2">
    <Label>Schema File</Label>
    <FileDropZone.Root
      onUpload={handleUpload}
      onFileRejected={handleFileRejected}
      maxFileSize={5 * FileDropZone.MEGABYTE}
      maxFiles={1}
      fileCount={selectedFile ? 1 : 0}
      disabled={uploading}
      bind:ref={fileInput}
    >
      <FileDropZone.Trigger />
    </FileDropZone.Root>
  </div>

  <div class="space-y-2">
    <Label for="db-url">Database URL (optional)</Label>
    <Input
      id="db-url"
      type="text"
      placeholder="postgresql://user:pass@localhost:5432/mydb"
      bind:value={databaseUrl}
      disabled={uploading}
    />
    <p class="text-xs text-muted-foreground">
      Optional. Required only to execute queries.
    </p>
  </div>

  <Button class="w-full" onclick={handleSubmit} disabled={uploading || !selectedFile}>
    {#if uploading}
      <Loader class="h-4 w-4 mr-2 animate-spin" />
      Creating workspace...
    {:else}
      <Upload class="h-4 w-4 mr-2" />
      {submitLabel}
    {/if}
  </Button>

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}
</div>