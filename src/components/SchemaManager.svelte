<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Settings, Trash2, FileCode, Database, Pencil } from "@lucide/svelte";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as RadioGroup from "$lib/components/ui/radio-group/index.js";
  import Input from "$lib/components/ui/input/input.svelte";
  import WorkspaceUploadForm from "./WorkspaceUploadForm.svelte";

  let {
    currentWorkspaceId,
    workspaces,
    onworkspacechange,
    onworkspacecreate,
    onworkspacedelete,
    onworkspaceupdate
  }: {
    currentWorkspaceId: string | null;
    workspaces: Array<{ id: string; name: string; createdAt: Date; databaseUrl?: string | null }>;
    onworkspacechange: (workspaceId: string | null) => void;
    onworkspacecreate: (name: string, file: File, databaseUrl: string | null) => Promise<void>;
    onworkspacedelete: (workspaceId: string) => void;
    onworkspaceupdate: (workspaceId: string, databaseUrl: string | null) => Promise<void>;
  } = $props();

  let open = $state(false);
  let uploading = $state(false);
  let error = $state<string | null>(null);
  let workspaceName = $state("");
  let databaseUrl = $state("");

  let editingWorkspaceId = $state<string | null>(null);
  let editDatabaseUrl = $state("");
  let updating = $state(false);
  let updateError = $state<string | null>(null);

  let selectedSchemaId = $derived(currentWorkspaceId ?? "default");

  async function handleUpload(name: string, file: File, dbUrl: string | null) {
    uploading = true;
    error = null;

    try {
      await onworkspacecreate(name, file, dbUrl);
      workspaceName = "";
      databaseUrl = "";
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : "Upload failed";
    } finally {
      uploading = false;
    }
  }

  function handleSchemaChange(value: string) {
    onworkspacechange(value === "default" ? null : value);
    open = false;
  }

  function handleDelete(workspaceId: string, event: MouseEvent) {
    event.stopPropagation();
    onworkspacedelete(workspaceId);
  }

  function startEdit(workspaceId: string, event: MouseEvent) {
    event.stopPropagation();
    const workspace = workspaces.find((w) => w.id === workspaceId);
    editingWorkspaceId = workspaceId;
    editDatabaseUrl = workspace?.databaseUrl ?? "";
    updateError = null;
  }

  function cancelEdit() {
    editingWorkspaceId = null;
    editDatabaseUrl = "";
    updateError = null;
  }

  async function handleUpdate() {
    if (!editingWorkspaceId) return;

    updating = true;
    updateError = null;

    try {
      await onworkspaceupdate(
        editingWorkspaceId,
        editDatabaseUrl.trim() ? editDatabaseUrl.trim() : null
      );
      editingWorkspaceId = null;
      editDatabaseUrl = "";
    } catch (e) {
      updateError = e instanceof Error ? e.message : "Update failed";
    } finally {
      updating = false;
    }
  }

  function formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>
    <Button variant="ghost" size="icon" class="h-8 w-8">
      <Settings class="h-4 w-4" />
    </Button>
  </Dialog.Trigger>

  <Dialog.Content class="max-w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>Schema Manager</Dialog.Title>
      <Dialog.Description>
        Switch between schemas or upload one. Database URL is optional unless you want to execute queries.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-4">
      <div class="space-y-3">
        <Label class="text-sm font-semibold">Active Schema</Label>
        <RadioGroup.Root value={selectedSchemaId} onValueChange={handleSchemaChange}>
          <div class="flex items-center space-x-3 rounded-md border border-border p-3 hover:bg-accent/50 transition-colors">
            <RadioGroup.Item value="default" id="default" />
            <Label for="default" class="flex-1 cursor-pointer flex items-center gap-2">
              <Database class="h-4 w-4 text-muted-foreground" />
              <div class="flex-1">
                <div class="font-medium">Project Schema</div>
                <div class="text-xs text-muted-foreground">Local prisma/schema.prisma (if present)</div>
              </div>
            </Label>
          </div>

          {#each workspaces as workspace}
            {#if editingWorkspaceId === workspace.id}
              <div class="rounded-md border border-primary p-3 space-y-3">
                <div class="flex items-center gap-2">
                  <FileCode class="h-4 w-4 text-primary" />
                  <div class="flex-1">
                    <div class="font-medium">{workspace.name}</div>
                    <div class="text-xs text-muted-foreground">{formatDate(workspace.createdAt)}</div>
                  </div>
                </div>

                <div class="space-y-2">
                  <Label for="edit-db-url" class="text-xs">Database URL</Label>
                  <Input
                    id="edit-db-url"
                    type="text"
                    placeholder="postgresql://... (leave empty to remove)"
                    value={editDatabaseUrl}
                    oninput={(e) => editDatabaseUrl = (e.target as HTMLInputElement).value}
                    disabled={updating}
                    class="h-8 text-sm font-mono"
                  />
                  <p class="text-xs text-muted-foreground">Leave empty to remove database URL</p>
                </div>

                {#if updateError}
                  <p class="text-xs text-destructive">{updateError}</p>
                {/if}

                <div class="flex gap-2">
                  <Button class="flex-1 h-8" onclick={handleUpdate} disabled={updating}>
                    {updating ? "Updating..." : "Update"}
                  </Button>
                  <Button variant="outline" class="flex-1 h-8" onclick={cancelEdit} disabled={updating}>
                    Cancel
                  </Button>
                </div>
              </div>
            {:else}
              <div class="flex items-center space-x-3 rounded-md border border-border p-3 hover:bg-accent/50 transition-colors">
                <RadioGroup.Item value={workspace.id} id={workspace.id} />
                <Label for={workspace.id} class="flex-1 cursor-pointer flex items-center gap-2">
                  <FileCode class="h-4 w-4 text-primary" />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium">{workspace.name}</div>
                    <div class="text-xs text-muted-foreground">{formatDate(workspace.createdAt)}</div>
                    {#if workspace.databaseUrl}
                      <div class="text-xs text-muted-foreground font-mono truncate mt-0.5" title={workspace.databaseUrl}>
                        {workspace.databaseUrl}
                      </div>
                    {:else}
                      <div class="text-xs text-muted-foreground italic mt-0.5">No database URL</div>
                    {/if}
                  </div>
                </Label>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 hover:bg-accent shrink-0"
                  onclick={(e) => startEdit(workspace.id, e)}
                >
                  <Pencil class="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onclick={(e) => handleDelete(workspace.id, e)}
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
            {/if}
          {/each}
        </RadioGroup.Root>
      </div>

      <div class="space-y-4 border rounded-md p-6">
        <Label class="text-sm font-semibold">Upload Schema</Label>
        <WorkspaceUploadForm
          bind:workspaceName
          bind:databaseUrl
          {uploading}
          {error}
          onsubmit={handleUpload}
        />
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>