<script lang="ts">
  import { onMount } from "svelte";
  import {
    type EmbeddedConfig,
    defaultEmbeddedConfig,
    type DMMFData,
    type Operation,
    type OperationType,
  } from "../lib/types.js";
  import Sidebar from "./Sidebar.svelte";
  import QueryTabs from "./QueryTabs.svelte";
  import QueryResults from "./QueryResults.svelte";
  import WorkspaceUploadForm from "./WorkspaceUploadForm.svelte";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import { createDMMFParser, type DMMFParser } from "../lib/dmmf-parser.js";
  import {
    executeQuery as executeQueryApi,
    fetchDmmf,
    deleteWorkspace,
    updateWorkspace,
  } from "../lib/api-client.js";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Menu } from "@lucide/svelte";

  let {
    dmmf,
    embeddedConfig = defaultEmbeddedConfig,
  }: {
    dmmf?: DMMFData;
    embeddedConfig?: EmbeddedConfig;
  } = $props();

  let embeddedHasDatabase = $state(false);

  type WorkspaceInfo = {
    id: string;
    name: string;
    createdAt: Date;
    databaseUrl?: string | null;
  };

  let parser = $state<DMMFParser | undefined>(undefined);
  let operations = $state<Operation[]>([]);
  let selectedType = $state<OperationType | null>("read");
  let selectedOperation = $state<Operation | null>(null);
  let isLoading = $state(true);
  let error = $state<Error | null>(null);

  let currentWorkspaceId = $state<string | null>(null);
  let workspaces = $state<WorkspaceInfo[]>([]);
  let isLoadingWorkspace = $state(false);

  let queryResult = $state<{
    success: boolean;
    data?: any;
    error?: string;
    executionTime?: number;
  } | null>(null);
  let isExecuting = $state(false);

  let hasResults = $derived(queryResult !== null);
  let isAnimating = $state(false);
  let isMobileSidebarOpen = $state(false);
  let isMobile = $state(false);

  let hasLocalSchema = $derived(
    dmmf !== undefined || embeddedConfig.isEmbedded,
  );

  // Embedded mode hides workspace management — no indirection needed
  let showWorkspaceUpload = $derived(!embeddedConfig.isEmbedded);

  let emptyStateWorkspaceName = $state("");
  let emptyStateDatabaseUrl = $state("");
  let emptyStateUploading = $state(false);
  let emptyStateError = $state<string | null>(null);

  let operationsByType = $derived<Record<OperationType, Operation[]>>({
    read: operations.filter((op) => op.type === "read"),
    write: operations.filter((op) => op.type === "write"),
  });

  let filteredOperations = $derived(
    selectedType ? operationsByType[selectedType] : operations,
  );

  $effect(() => {
    if (hasResults) {
      isAnimating = true;
      const timer = setTimeout(() => {
        isAnimating = false;
      }, 300);
      return () => clearTimeout(timer);
    }
  });

  function checkMobile() {
    isMobile = window.innerWidth < 768;
  }

  async function loadWorkspaces(): Promise<void> {
    if (embeddedConfig.isEmbedded) return;

    try {
      const response = await fetch("/api/workspace/list");
      if (!response.ok) return;

      const data = await response.json();
      workspaces = (data.workspaces ?? []).map((w: any) => ({
        id: String(w.id),
        name: String(w.name),
        createdAt: new Date(w.createdAt),
        databaseUrl: w.databaseUrl || null,
      }));

      if (workspaces.length > 0 && !currentWorkspaceId && !hasLocalSchema) {
        await handleWorkspaceChange(workspaces[0].id);
      }
    } catch (err) {
      console.warn("[QueryBuilder] Failed to load workspaces:", err);
    }
  }

  function setParserFromDmmf(next: DMMFData) {
    parser = createDMMFParser(next);
    operations = parser.getOperations();
    selectedOperation = null;
    queryResult = null;
  }

  async function tryLoadLocalSchemaDmmf() {
    if (embeddedConfig.isEmbedded) {
      try {
        const dmmfData = await fetchDmmf();
        embeddedHasDatabase = !!(dmmfData as any)._embedded?.hasDatabaseUrl;
        setParserFromDmmf(dmmfData);
        return;
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        return;
      }
    }

    if (!dmmf) return;

    try {
      setParserFromDmmf(dmmf);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    }
  }

  async function loadWorkspace(workspaceId: string) {
    isLoadingWorkspace = true;
    try {
      const workspaceDmmf = await fetchDmmf(workspaceId);
      setParserFromDmmf(workspaceDmmf);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    } finally {
      isLoadingWorkspace = false;
    }
  }

  async function handleWorkspaceChange(workspaceId: string | null) {
    if (workspaceId === currentWorkspaceId) return;

    currentWorkspaceId = workspaceId;

    if (workspaceId === null) {
      await tryLoadLocalSchemaDmmf();
      selectedOperation = null;
      queryResult = null;
      return;
    }

    await loadWorkspace(workspaceId);
  }

  async function handleWorkspaceCreate(
    name: string,
    file: File,
    databaseUrl: string | null,
  ) {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("schema", file);
    if (databaseUrl && databaseUrl.trim()) {
      formData.append("databaseUrl", databaseUrl);
    }

    const response = await fetch("/api/workspace/create", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as any).error || "Upload failed");
    }

    const { workspaceId, name: workspaceName } = await response.json();

    workspaces = [
      {
        id: workspaceId,
        name: workspaceName,
        createdAt: new Date(),
        databaseUrl,
      },
      ...workspaces,
    ];

    await handleWorkspaceChange(workspaceId);
  }

  async function handleWorkspaceDelete(workspaceId: string) {
    try {
      await deleteWorkspace(workspaceId);
      workspaces = workspaces.filter((w) => w.id !== workspaceId);
      if (currentWorkspaceId === workspaceId) {
        currentWorkspaceId = null;
        parser = undefined;
        operations = [];
        selectedOperation = null;
        queryResult = null;
      }
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    }
  }

  async function handleWorkspaceUpdate(
    workspaceId: string,
    databaseUrl: string | null,
  ) {
    try {
      await updateWorkspace(workspaceId, databaseUrl);
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (workspace) {
        workspace.databaseUrl = databaseUrl;
      }
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      throw e;
    }
  }

  function handleTypeSelect(type: OperationType) {
    selectedType = type;
    selectedOperation = null;
    queryResult = null;
    if (isMobile) isMobileSidebarOpen = false;
  }

  function handleOperationSelect(operation: Operation) {
    selectedOperation = operation;
    queryResult = null;
    if (isMobile) isMobileSidebarOpen = false;
  }

  async function handleRun(queryState: any, usePrismaSql = false) {
    if (!queryState.operation) return;

    isExecuting = true;
    queryResult = null;

    try {
      const result = await executeQueryApi(
        queryState,
        currentWorkspaceId ?? undefined,
        usePrismaSql,
      );
      queryResult = result;
    } catch (e) {
      queryResult = {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    } finally {
      isExecuting = false;
    }
  }

  async function handleSaveQuery(name: string, queryState: any) {
    if (embeddedConfig.disablePersistence) {
      return { id: `temp-${Date.now()}` };
    }

    const response = await fetch("/api/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        model: queryState.operation?.model,
        method: queryState.operation?.method,
        payload: JSON.stringify(queryState.payload),
        workspaceId: currentWorkspaceId,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as any).error || "Failed to save query");
    }

    const saved = await response.json();
    return saved as { id: string };
  }

  function handleCloseResults() {
    queryResult = null;
  }

  async function handleEmptyStateUpload(
    name: string,
    file: File,
    databaseUrl: string | null,
  ) {
    emptyStateUploading = true;
    emptyStateError = null;

    try {
      await handleWorkspaceCreate(name, file, databaseUrl);
      emptyStateWorkspaceName = "";
      emptyStateDatabaseUrl = "";
    } catch (e) {
      emptyStateError = e instanceof Error ? e.message : "Upload failed";
      throw e;
    } finally {
      emptyStateUploading = false;
    }
  }

  const noopWorkspaceChange = () => {};
  const noopWorkspaceCreate = async () => {};
  const noopWorkspaceDelete = async () => {};
  const noopWorkspaceUpdate = async () => {};

  onMount(() => {
    checkMobile();
    window.addEventListener("resize", checkMobile);

    (async () => {
      try {
        if (embeddedConfig.isEmbedded) {
          await tryLoadLocalSchemaDmmf();
        } else {
          await loadWorkspaces();

          if (workspaces.length === 0 && hasLocalSchema) {
            await tryLoadLocalSchemaDmmf();
          }
        }
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
      } finally {
        isLoading = false;
      }
    })();

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  });
</script>

{#if isLoading || isLoadingWorkspace}
  <div class="flex h-screen items-center justify-center bg-background">
    <div class="text-center">
      <div
        class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"
      ></div>
      <p class="text-muted-foreground mb-2">
        {isLoadingWorkspace ? "Loading workspace..." : "Starting..."}
      </p>
    </div>
  </div>
{:else if error}
  <div class="flex h-screen items-center justify-center bg-background p-4">
    <div
      class="p-4 border border-destructive rounded max-w-md w-full space-y-3"
    >
      <h3 class="font-semibold text-destructive">Error</h3>
      <p class="text-sm break-words">{error.message}</p>
      <Button variant="secondary" onclick={() => (error = null)}>
        Dismiss
      </Button>
    </div>
  </div>
{:else if !parser}
  {#if showWorkspaceUpload}
    <div class="flex h-screen items-center justify-center bg-background p-4">
      <div class="max-w-md w-full border border-border rounded p-6 space-y-4">
        <div>
          <h3 class="font-semibold text-lg">No schema loaded</h3>
          <p class="text-sm text-muted-foreground mt-2">
            Upload a Prisma schema to get started. Database URL is optional
            unless you want to execute queries.
          </p>
        </div>

        <div class="border-t pt-4">
          <WorkspaceUploadForm
            bind:workspaceName={emptyStateWorkspaceName}
            bind:databaseUrl={emptyStateDatabaseUrl}
            uploading={emptyStateUploading}
            error={emptyStateError}
            onsubmit={handleEmptyStateUpload}
          />
        </div>
      </div>
    </div>
  {:else}
    <div class="flex h-screen items-center justify-center bg-background p-4">
      <div class="text-center max-w-md space-y-4">
        <h3 class="text-lg font-semibold">No Schema Loaded</h3>
        <p class="text-muted-foreground text-sm">
          Query builder is running in embedded mode but no schema was provided.
        </p>
        <div class="bg-muted/50 rounded p-4 text-left">
          <p class="text-sm font-medium mb-2">
            Required Environment Variables:
          </p>
          <p class="text-xs text-muted-foreground font-mono">
            PRISMA_QUERY_BUILDER_SCHEMA_CONTENT
          </p>
          <p class="text-xs text-muted-foreground italic">or</p>
          <p class="text-xs text-muted-foreground font-mono">
            PRISMA_QUERY_BUILDER_SCHEMA
          </p>
        </div>
        <p class="text-xs text-muted-foreground">
          Check that the parent process is providing schema configuration.
        </p>
      </div>
    </div>
  {/if}
{:else if isMobile}
  <div class="flex flex-col h-screen">
    <div
      class="h-[60px] shrink-0 flex items-center justify-between px-3 border-b border-border bg-muted/50"
    >
      <Button
        variant="ghost"
        size="icon"
        onclick={() => (isMobileSidebarOpen = !isMobileSidebarOpen)}
      >
        <Menu class="h-5 w-5" />
      </Button>
      <div class="text-sm font-semibold truncate">
        {#if embeddedConfig.isEmbedded}
          Embedded Mode
        {:else if currentWorkspaceId}
          {workspaces.find((w) => w.id === currentWorkspaceId)?.name ??
            "Unknown"}
        {:else}
          Project Schema
        {/if}
      </div>
      <div class="w-10"></div>
    </div>

    {#if isMobileSidebarOpen}
      <div class="absolute inset-0 z-50 bg-background">
        <Sidebar
          {selectedType}
          {selectedOperation}
          operations={filteredOperations}
          currentWorkspaceId={showWorkspaceUpload ? currentWorkspaceId : null}
          workspaces={showWorkspaceUpload ? workspaces : []}
          {hasLocalSchema}
          showWorkspaceManagement={showWorkspaceUpload}
          onSelectType={handleTypeSelect}
          onSelectOperation={handleOperationSelect}
          onWorkspaceChange={showWorkspaceUpload
            ? handleWorkspaceChange
            : noopWorkspaceChange}
          onWorkspaceCreate={showWorkspaceUpload
            ? handleWorkspaceCreate
            : noopWorkspaceCreate}
          onWorkspaceDelete={showWorkspaceUpload
            ? handleWorkspaceDelete
            : noopWorkspaceDelete}
          onWorkspaceUpdate={showWorkspaceUpload
            ? handleWorkspaceUpdate
            : noopWorkspaceUpdate}
        />
        <div class="absolute top-3 right-3">
          <Button
            variant="ghost"
            size="icon"
            onclick={() => (isMobileSidebarOpen = false)}
          >
            <span class="text-xl">&times;</span>
          </Button>
        </div>
      </div>
    {:else}
      <div class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 overflow-hidden">
          <QueryTabs
            {parser}
            {selectedOperation}
            {currentWorkspaceId}
            {embeddedHasDatabase}
            disablePersistence={embeddedConfig.disablePersistence}
            onrun={handleRun}
            onsave={handleSaveQuery}
          />
        </div>

        {#if hasResults}
          <div
            class="h-[40vh] border-t border-border {isAnimating
              ? 'transition-all duration-300 ease-in-out'
              : ''}"
          >
            <QueryResults
              result={queryResult}
              {isExecuting}
              onclose={handleCloseResults}
            />
          </div>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <Resizable.PaneGroup direction="horizontal" class="h-screen">
    <Resizable.Pane defaultSize={15} minSize={10} maxSize={30}>
      <Sidebar
        {selectedType}
        {selectedOperation}
        operations={filteredOperations}
        currentWorkspaceId={showWorkspaceUpload ? currentWorkspaceId : null}
        workspaces={showWorkspaceUpload ? workspaces : []}
        {hasLocalSchema}
        showWorkspaceManagement={showWorkspaceUpload}
        onSelectType={handleTypeSelect}
        onSelectOperation={handleOperationSelect}
        onWorkspaceChange={showWorkspaceUpload
          ? handleWorkspaceChange
          : noopWorkspaceChange}
        onWorkspaceCreate={showWorkspaceUpload
          ? handleWorkspaceCreate
          : noopWorkspaceCreate}
        onWorkspaceDelete={showWorkspaceUpload
          ? handleWorkspaceDelete
          : noopWorkspaceDelete}
        onWorkspaceUpdate={showWorkspaceUpload
          ? handleWorkspaceUpdate
          : noopWorkspaceUpdate}
      />
    </Resizable.Pane>

    <Resizable.Handle withHandle />

    <Resizable.Pane defaultSize={hasResults ? 55 : 85} minSize={40}>
      <QueryTabs
        {parser}
        {selectedOperation}
        {currentWorkspaceId}
        {embeddedHasDatabase}
        disablePersistence={embeddedConfig.disablePersistence}
        onrun={handleRun}
        onsave={handleSaveQuery}
      />
    </Resizable.Pane>

    {#if hasResults}
      <Resizable.Handle withHandle />
      <Resizable.Pane
        defaultSize={30}
        minSize={20}
        maxSize={50}
        class={isAnimating ? "transition-all duration-300 ease-in-out" : ""}
      >
        <QueryResults
          result={queryResult}
          {isExecuting}
          onclose={handleCloseResults}
        />
      </Resizable.Pane>
    {/if}
  </Resizable.PaneGroup>
{/if}