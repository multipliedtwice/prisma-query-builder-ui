<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import { ChevronDown, FileCode, Database, Upload, Trash2, Loader, Check, Pencil } from "@lucide/svelte";
  import { Label } from "$lib/components/ui/label/index.js";
  import type { Operation, OperationType } from "../lib/types.ts";

  let {
    selectedType,
    selectedOperation,
    operations,
    currentWorkspaceId,
    workspaces,
    hasLocalSchema,
    showWorkspaceManagement = true,
    onSelectType,
    onSelectOperation,
    onWorkspaceChange,
    onWorkspaceCreate,
    onWorkspaceDelete,
    onWorkspaceUpdate,
  }: {
    selectedType: OperationType | null;
    selectedOperation: Operation | null;
    operations: Operation[];
    currentWorkspaceId: string | null;
    workspaces: Array<{ id: string; name: string; createdAt: Date; databaseUrl?: string | null }>;
    hasLocalSchema: boolean;
    showWorkspaceManagement?: boolean;
    onSelectType: (type: OperationType) => void;
    onSelectOperation: (operation: Operation) => void;
    onWorkspaceChange: (workspaceId: string | null) => void;
    onWorkspaceCreate: (
      name: string,
      file: File,
      databaseUrl: string | null,
    ) => Promise<void>;
    onWorkspaceDelete: (workspaceId: string) => void;
    onWorkspaceUpdate: (workspaceId: string, databaseUrl: string | null) => Promise<void>;
  } = $props();

  let groupedOperations = $derived(
    operations.reduce(
      (acc, op) => {
        if (!acc[op.model]) acc[op.model] = [];
        acc[op.model].push(op);
        return acc;
      },
      {} as Record<string, Operation[]>,
    ),
  );

  let expandedModels = $state<Record<string, boolean>>({});

  let activeWorkspaceName = $derived.by(() => {
    if (!currentWorkspaceId) return "Project Schema";
    const workspace = workspaces.find((w) => w.id === currentWorkspaceId);
    return workspace?.name ?? "Unknown";
  });

  let uploading = $state(false);
  let uploadError = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement>();
  let fileSelected = $state<File | null>(null);
  let workspaceName = $state("");
  let databaseUrl = $state("");
  let showUploadForm = $state(false);
  let dropdownOpen = $state(false);

  let editingWorkspaceId = $state<string | null>(null);
  let editDatabaseUrl = $state("");
  let updating = $state(false);
  let updateError = $state<string | null>(null);

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      fileSelected = file;
      if (!workspaceName) workspaceName = file.name.replace(".prisma", "");
      showUploadForm = true;
    }
  }

  async function handleUpload() {
    if (!fileSelected) return;

    uploading = true;
    uploadError = null;

    try {
      await onWorkspaceCreate(
        workspaceName || fileSelected.name,
        fileSelected,
        databaseUrl.trim() ? databaseUrl.trim() : null
      );

      fileSelected = null;
      workspaceName = "";
      databaseUrl = "";
      showUploadForm = false;
      dropdownOpen = false;
    } catch (e) {
      uploadError = e instanceof Error ? e.message : "Upload failed";
    } finally {
      uploading = false;
    }
  }

  function cancelUpload() {
    fileSelected = null;
    workspaceName = "";
    databaseUrl = "";
    uploadError = null;
    showUploadForm = false;
  }

  function handleSchemaChange(workspaceId: string | null) {
    onWorkspaceChange(workspaceId);
    dropdownOpen = false;
  }

  function handleDelete(workspaceId: string, event: MouseEvent) {
    event.stopPropagation();
    onWorkspaceDelete(workspaceId);
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
      await onWorkspaceUpdate(
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

  $effect(() => {
    const models = Object.keys(groupedOperations);
    models.forEach((model, index) => {
      if (expandedModels[model] === undefined) {
        expandedModels[model] = index === 0;
      }
    });
  });
</script>

<div class="@container flex flex-col bg-background h-full">
  <!-- Header Section - Conditional based on showWorkspaceManagement -->
  {#if showWorkspaceManagement}
    <div class="h-[60px] shrink-0 bg-muted/50 border-b border-border px-2 flex items-center">
      <DropdownMenu.Root bind:open={dropdownOpen}>
        <DropdownMenu.Trigger class="w-full">
          <Button variant="ghost" class="w-full justify-between px-2 h-9">
            <span class="text-sm font-semibold truncate" title={activeWorkspaceName}>
              {activeWorkspaceName}
            </span>
            <ChevronDown class="h-4 w-4 ml-2 shrink-0" />
          </Button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content class="w-[min(95vw,480px)] max-h-[400px] overflow-y-auto">
          {#if !showUploadForm && !editingWorkspaceId}
            <DropdownMenu.Label>Select Schema</DropdownMenu.Label>
            <DropdownMenu.Separator />

            {#if hasLocalSchema}
              <DropdownMenu.Item
                class="flex items-center gap-2 cursor-pointer"
                onclick={() => handleSchemaChange(null)}
              >
                <Database class="h-4 w-4 text-muted-foreground" />
                <div class="flex-1">
                  <div class="font-medium">Project Schema</div>
                  <div class="text-xs text-muted-foreground">prisma/schema.prisma</div>
                </div>
                {#if currentWorkspaceId === null}
                  <Check class="h-4 w-4" />
                {/if}
              </DropdownMenu.Item>
            {/if}

            {#each workspaces as workspace}
              <DropdownMenu.Item
                class="flex items-center gap-2 cursor-pointer"
                onclick={() => handleSchemaChange(workspace.id)}
              >
                <FileCode class="h-4 w-4 text-primary" />
                <div class="flex-1">
                  <div class="font-medium">{workspace.name}</div>
                  <div class="text-xs text-muted-foreground">{formatDate(workspace.createdAt)}</div>
                </div>
                <div class="flex items-center gap-1">
                  {#if currentWorkspaceId === workspace.id}
                    <Check class="h-4 w-4" />
                  {/if}
                  <button
                    class="p-1 hover:bg-accent rounded"
                    onclick={(e) => startEdit(workspace.id, e)}
                  >
                    <Pencil class="h-3 w-3" />
                  </button>
                  <button
                    class="p-1 hover:bg-destructive/10 rounded text-destructive"
                    onclick={(e) => handleDelete(workspace.id, e)}
                  >
                    <Trash2 class="h-3 w-3" />
                  </button>
                </div>
              </DropdownMenu.Item>
            {/each}

            <DropdownMenu.Separator />

            <DropdownMenu.Item class="cursor-pointer" onclick={() => fileInput?.click()}>
              <Upload class="h-4 w-4 mr-2" />
              Upload Schema
            </DropdownMenu.Item>

            <input
              type="file"
              accept=".prisma"
              class="hidden"
              bind:this={fileInput}
              onchange={handleFileSelect}
            />
          {:else if editingWorkspaceId}
            {@const currentWorkspace = workspaces.find((w) => w.id === editingWorkspaceId)}
            <div class="p-3 space-y-3">
              <div class="font-semibold text-sm">Edit Database URL</div>

              {#if currentWorkspace}
                <div class="text-xs text-muted-foreground">
                  Workspace: {currentWorkspace.name}
                </div>
              {/if}

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
                  {#if updating}
                    <Loader class="h-3 w-3 mr-2 animate-spin" />
                    Updating...
                  {:else}
                    Update
                  {/if}
                </Button>
                <Button variant="outline" class="flex-1 h-8" onclick={cancelEdit} disabled={updating}>
                  Cancel
                </Button>
              </div>
            </div>
          {:else}
            <div class="p-3 space-y-3">
              <div class="font-semibold text-sm">Upload Schema</div>

              <div class="space-y-2">
                <Label for="workspace-name" class="text-xs">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  type="text"
                  placeholder="My Schema"
                  bind:value={workspaceName}
                  disabled={uploading}
                  class="h-8 text-sm"
                />
              </div>

              <div class="space-y-2">
                <Label for="schema-file" class="text-xs">File</Label>
                <div class="text-xs text-muted-foreground truncate">{fileSelected?.name}</div>
              </div>

              <div class="space-y-2">
                <Label for="db-url" class="text-xs">Database URL (optional)</Label>
                <Input
                  id="db-url"
                  type="text"
                  placeholder="postgresql://..."
                  bind:value={databaseUrl}
                  disabled={uploading}
                  class="h-8 text-sm font-mono"
                />
              </div>

              {#if uploadError}
                <p class="text-xs text-destructive">{uploadError}</p>
              {/if}

              <div class="flex gap-2">
                <Button class="flex-1 h-8" onclick={handleUpload} disabled={uploading || !fileSelected}>
                  {#if uploading}
                    <Loader class="h-3 w-3 mr-2 animate-spin" />
                    Creating...
                  {:else}
                    Create
                  {/if}
                </Button>
                <Button variant="outline" class="flex-1 h-8" onclick={cancelUpload} disabled={uploading}>
                  Cancel
                </Button>
              </div>
            </div>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  {:else}
    <!-- Embedded Mode: Simple header without workspace management -->
    <div class="h-[60px] shrink-0 bg-muted/50 border-b border-border px-4 flex items-center">
      <div class="flex items-center gap-2">
        <Database class="h-4 w-4 text-muted-foreground" />
        <span class="text-sm font-semibold">Schema Loaded</span>
      </div>
    </div>
  {/if}

  <!-- Operations Tabs - Always visible -->
  <div class="h-[52px] shrink-0 flex items-center justify-between px-2 border-b border-border gap-2">
    <Tabs.Root
      value={selectedType || "read"}
      onValueChange={(v: string) => onSelectType(v as OperationType)}
      class="flex-1"
    >
      <Tabs.List class="grid w-full grid-cols-2">
        <Tabs.Trigger value="read">Read</Tabs.Trigger>
        <Tabs.Trigger value="write">Write</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </div>

  <!-- Operations List - Always visible -->
  {#if selectedType}
    <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-2 pt-2">
      {#each Object.entries(groupedOperations) as [model, ops]}
        {#if expandedModels[model] !== undefined}
          <Collapsible.Root bind:open={expandedModels[model]}>
            <Collapsible.Trigger
              class="flex items-center justify-between w-full p-2 hover:bg-accent rounded"
            >
              <span class="font-semibold text-sm">{model}</span>
              <ChevronDown
                class={`h-4 w-4 transition-transform duration-200 ${expandedModels[model] ? "rotate-180" : ""}`}
              />
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div class="space-y-1 mt-1 ml-2">
                {#each ops as operation}
                  <Button
                    variant={selectedOperation?.model === operation.model &&
                    selectedOperation?.method === operation.method
                      ? "secondary"
                      : "ghost"}
                    class="w-full justify-start text-sm"
                    onclick={() => onSelectOperation(operation)}
                  >
                    {operation.method}
                  </Button>
                {/each}
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        {/if}
      {/each}
    </div>
  {/if}
</div>