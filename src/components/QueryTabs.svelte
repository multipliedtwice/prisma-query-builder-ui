<script lang="ts">
  import { onMount } from "svelte";
  import { QueryBuilder } from "../lib/query-builder.svelte.ts";
  import ArgTree from "./ArgTree.svelte";
  import CodePreview from "./CodePreview.svelte";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import Button from "$lib/components/ui/button/button.svelte";
  import {
    Plus,
    X,
    Pencil,
    Save,
    TriangleAlert,
    Github,
    Moon,
    Sun,
  } from "@lucide/svelte";
  import type { DMMFParser } from "../lib/dmmf-parser.ts";
  import type {
    Operation,
    Payload,
    PayloadValue,
    QueryTab,
  } from "../lib/types.ts";
  import { loadQueries } from "../lib/queries-client.ts";

  let {
    parser,
    selectedOperation,
    currentWorkspaceId,
    isEmbedded = false,
    embeddedHasDatabase = false,
    disablePersistence = false,
    onrun,
    onsave,
  }: {
    parser: DMMFParser;
    selectedOperation: Operation | null;
    currentWorkspaceId: string | null;
    isEmbedded?: boolean;
    embeddedHasDatabase?: boolean;
    disablePersistence?: boolean;
    onrun: (queryState: any, usePrismaSql?: boolean) => void;
    onsave: (name: string, queryState: any) => Promise<{ id: string }>;
  } = $props();

  const MAX_TABS = 20;

  let tabs = $state<QueryTab[]>([]);
  let activeTabId = $state("1");
  let nextTabId = $state(2);
  let editingTabId = $state<string | null>(null);
  let editingTabName = $state("");
  let isSaving = $state(false);
  let isLoadingQueries = $state(false);
  let isDark = $state(false);
  let usePrismaSql = $state(false);
  let prismaSqlInitialized = $state(false);
  let loadGeneration = 0;
  let appliedOperationKeys = $state(new Map<string, string>());

  let activeTab = $derived(tabs.find((t) => t.id === activeTabId));
  let activeBuilder = $derived(activeTab?.builder);

  let queryState = $derived(
    activeBuilder?.state ?? {
      operation: null,
      path: [],
      payload: {},
    },
  );

  let incompatibleTabs = $derived(
    tabs.filter(
      (t) => t.workspaceId !== null && t.workspaceId !== currentWorkspaceId,
    ),
  );

  let hasDirtyTabs = $derived(
    !disablePersistence &&
      tabs.some(
        (t) =>
          t.isDirty &&
          t.builder.state.operation &&
          t.workspaceId === currentWorkspaceId,
      ),
  );

  function payloadHash(payload: Payload): string {
    return JSON.stringify(payload);
  }

  function markDirty(tab: QueryTab) {
    const currentHash = payloadHash(tab.builder.state.payload);
    tab.isDirty = currentHash !== tab.initialPayload;
  }

  function createNewTab(): QueryTab {
    const newTab: QueryTab = {
      id: String(nextTabId),
      label: `Query ${nextTabId}`,
      isCustomName: false,
      builder: new QueryBuilder(),
      workspaceId: currentWorkspaceId,
      savedQueryId: null,
      isDirty: false,
      initialPayload: payloadHash({}),
      createdAt: new Date(),
    };
    return newTab;
  }

  function initEmptyTabs() {
    const emptyTab: QueryTab = {
      id: "1",
      label: "Query 1",
      isCustomName: false,
      builder: new QueryBuilder(),
      workspaceId: currentWorkspaceId,
      savedQueryId: null,
      isDirty: false,
      initialPayload: payloadHash({}),
      createdAt: new Date(),
    };
    tabs = [emptyTab];
    activeTabId = "1";
    nextTabId = 2;
  }

  function addNewTab() {
    if (tabs.length >= MAX_TABS) {
      alert(`Maximum ${MAX_TABS} tabs allowed`);
      return;
    }

    const newTab = createNewTab();
    tabs.push(newTab);
    activeTabId = newTab.id;
    nextTabId++;
  }

  function closeTab(tabId: string, event: MouseEvent) {
    event.stopPropagation();
    if (tabs.length === 1) return;

    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.isDirty) {
      if (!confirm(`"${tab.label}" has unsaved changes. Close anyway?`)) {
        return;
      }
    }

    const index = tabs.findIndex((t) => t.id === tabId);
    tabs = tabs.filter((t) => t.id !== tabId);
    appliedOperationKeys.delete(tabId);

    if (activeTabId === tabId) {
      const newIndex = Math.min(index, tabs.length - 1);
      activeTabId = tabs[newIndex].id;
    }
  }

  function startEditingTab(tabId: string, event: MouseEvent) {
    event.stopPropagation();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    editingTabId = tabId;
    editingTabName = tab.label;
  }

  function finishEditingTab() {
    if (!editingTabId) return;

    const tab = tabs.find((t) => t.id === editingTabId);
    if (tab && editingTabName.trim()) {
      tab.label = editingTabName.trim();
      tab.isCustomName = true;
    }

    editingTabId = null;
    editingTabName = "";
  }

  function cancelEditingTab() {
    editingTabId = null;
    editingTabName = "";
  }

  function handleArgAdd(argName: string | string[], initialValue?: PayloadValue) {
    if (activeBuilder) {
      activeBuilder.addArg(argName, initialValue ?? {});
      if (activeTab) markDirty(activeTab);
    }
  }

  function handleFieldToggle(detail: {
    field: string;
    value: PayloadValue | undefined;
  }) {
    if (activeBuilder) {
      activeBuilder.toggleField(detail.field, detail.value);
      if (activeTab) markDirty(activeTab);
    }
  }

  function handleBreadcrumbClick(index: number) {
    if (activeBuilder) {
      activeBuilder.removeArg(index);
      if (activeTab) markDirty(activeTab);
    }
  }

  function handleAddArrayItem(arrayPath: string[]) {
    if (activeBuilder) {
      activeBuilder.addArrayItem(arrayPath);
      if (activeTab) markDirty(activeTab);
    }
  }

  function handleRemoveArrayItem(arrayPath: string[], index: number) {
    if (activeBuilder) {
      activeBuilder.removeArrayItem(arrayPath, index);
      if (activeTab) markDirty(activeTab);
    }
  }

  function handleEditPayload(payload: Payload) {
    if (activeBuilder) {
      activeBuilder.replacePayload(payload);
      if (activeTab) markDirty(activeTab);
    }
  }

  function handleRun() {
    onrun(queryState, usePrismaSql);
  }

  async function handleSaveAllQueries() {
    if (isSaving || disablePersistence) return;

    const dirtyTabs = tabs.filter(
      (t) =>
        t.isDirty &&
        t.builder.state.operation &&
        t.workspaceId === currentWorkspaceId,
    );

    if (dirtyTabs.length === 0) return;

    isSaving = true;

    try {
      for (const tab of dirtyTabs) {
        const operation = tab.builder.state.operation;
        if (!operation) continue;

        const name = tab.isCustomName
          ? tab.label
          : `${operation.model}.${operation.method}`;
        const saved = await onsave(name, tab.builder.state);

        tab.savedQueryId = saved.id;
        tab.isDirty = false;
        tab.initialPayload = payloadHash(tab.builder.state.payload);

        if (!tab.isCustomName) {
          tab.label = name;
          tab.isCustomName = true;
        }
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save queries");
    } finally {
      isSaving = false;
    }
  }

  function operationFromSaved(
    model: string,
    method: string,
  ): Operation | null {
    const ops = parser.getOperations();
    return (
      ops.find((op) => op.model === model && op.method === method) ?? null
    );
  }

  function safeJsonParsePayload(payload: string): Payload {
    try {
      const v = JSON.parse(payload || "{}");
      if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
      return v as Payload;
    } catch {
      return {};
    }
  }

  async function reloadTabsFromDb(token: number) {
    if (disablePersistence) {
      if (token !== loadGeneration) return;
      initEmptyTabs();
      appliedOperationKeys = new Map();
      return;
    }

    isLoadingQueries = true;
    try {
      const saved = await loadQueries(currentWorkspaceId);

      if (token !== loadGeneration) return;

      const loadedTabs: QueryTab[] = [];
      let idCounter = 1;

      for (const q of saved) {
        if (loadedTabs.length >= MAX_TABS) break;

        const op = operationFromSaved(q.model, q.method);
        const builder = new QueryBuilder();

        if (op) builder.setOperation(op);
        builder.replacePayload(safeJsonParsePayload(q.payload));

        const initialPayload = payloadHash(builder.state.payload);

        loadedTabs.push({
          id: String(idCounter),
          label: q.name || "Query",
          isCustomName: true,
          builder,
          workspaceId: currentWorkspaceId,
          savedQueryId: q.id,
          isDirty: false,
          initialPayload,
          createdAt: new Date(q.createdAt),
        });

        idCounter++;
      }

      if (token !== loadGeneration) return;

      appliedOperationKeys = new Map();

      if (loadedTabs.length === 0) {
        const emptyTab: QueryTab = {
          id: String(idCounter),
          label: `Query ${idCounter}`,
          isCustomName: false,
          builder: new QueryBuilder(),
          workspaceId: currentWorkspaceId,
          savedQueryId: null,
          isDirty: false,
          initialPayload: payloadHash({}),
          createdAt: new Date(),
        };
        tabs = [emptyTab];
        activeTabId = emptyTab.id;
        nextTabId = idCounter + 1;
      } else {
        tabs = loadedTabs;
        activeTabId = tabs[0].id;
        nextTabId = idCounter;
      }
    } catch {
      if (token !== loadGeneration) return;
      initEmptyTabs();
      appliedOperationKeys = new Map();
    } finally {
      if (token === loadGeneration) {
        isLoadingQueries = false;
      }
    }
  }

  function setTheme(dark: boolean) {
    try {
      document.documentElement.classList.toggle("dark", dark);
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      document.documentElement.classList.toggle("dark", dark);
    }
  }

  function getIsDark(): boolean {
    return document.documentElement.classList.contains("dark");
  }

  function toggleTheme() {
    isDark = !getIsDark();
    setTheme(isDark);
  }

  $effect(() => {
    if (!parser) return;
    const gen = ++loadGeneration;
    reloadTabsFromDb(gen);
  });

  $effect(() => {
    if (prismaSqlInitialized) {
      try {
        localStorage.setItem("usePrismaSql", String(usePrismaSql));
      } catch {}
    }
  });

  $effect(() => {
    if (!selectedOperation || !activeBuilder || !activeTab) return;

    const newKey = `${selectedOperation.model}.${selectedOperation.method}`;
    if (appliedOperationKeys.get(activeTab.id) === newKey) return;

    appliedOperationKeys.set(activeTab.id, newKey);

    const currentOp = activeBuilder.state.operation;
    const hasPayload = Object.keys(activeBuilder.state.payload).length > 0;

    const isDifferentOp =
      !currentOp ||
      currentOp.model !== selectedOperation.model ||
      currentOp.method !== selectedOperation.method;

    if (!isDifferentOp) return;

    if (hasPayload) {
      if (tabs.length >= MAX_TABS) {
        alert(`Maximum ${MAX_TABS} tabs. Close some tabs first.`);
        return;
      }

      const newTab = createNewTab();
      newTab.builder.setOperation(selectedOperation);
      newTab.label = newKey;
      tabs.push(newTab);
      activeTabId = newTab.id;
      nextTabId++;
      return;
    }

    activeBuilder.setOperation(selectedOperation);
    if (activeTab && !activeTab.isCustomName) {
      activeTab.label = newKey;
    }
  });

  onMount(() => {
    isDark = getIsDark();

    try {
      const saved = localStorage.getItem("usePrismaSql");
      if (saved !== null) {
        usePrismaSql = saved === "true";
      }
    } catch {}

    prismaSqlInitialized = true;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const dirty = tabs.some((t) => t.isDirty);
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  });
</script>

<div class="@container flex flex-col h-full">
  {#if incompatibleTabs.length > 0}
    <div
      class="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-2 flex items-center gap-2 text-sm"
    >
      <TriangleAlert class="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      <span class="text-yellow-800 dark:text-yellow-200">
        {incompatibleTabs.length} tab{incompatibleTabs.length > 1 ? "s" : ""}
        from different workspace{incompatibleTabs.length > 1 ? "s" : ""}
      </span>
    </div>
  {/if}

  <Tabs.Root
    value={activeTabId}
    onValueChange={(v: string) => (activeTabId = v)}
    class="flex-1 flex flex-col gap-0"
  >
    <div
      class="h-[60px] shrink-0 flex items-center gap-2 border-b border-border px-4 bg-muted overflow-x-auto"
    >
      <Tabs.List class="h-auto">
        {#each tabs as tab}
          {@const isIncompatible =
            tab.workspaceId !== null && tab.workspaceId !== currentWorkspaceId}
          <Tabs.Trigger
            value={tab.id}
            class="relative group max-w-[200px] {isIncompatible
              ? 'opacity-50'
              : ''}"
            disabled={isIncompatible || isLoadingQueries}
          >
            {#if editingTabId === tab.id}
              <input
                type="text"
                class="w-full px-1 py-0.5 text-sm bg-background border border-border rounded"
                bind:value={editingTabName}
                onkeydown={(e) => {
                  if (e.key === "Enter") finishEditingTab();
                  if (e.key === "Escape") cancelEditingTab();
                }}
                onblur={finishEditingTab}
                onclick={(e) => e.stopPropagation()}
              />
            {:else}
              <span class="truncate block pr-10">
                {tab.label}
                {#if tab.isDirty}<span class="text-primary">•</span>{/if}
              </span>
              <div
                class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1"
              >
                <button
                  type="button"
                  class="inline-flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-70 hover:opacity-100 transition-opacity"
                  onclick={(e) => startEditingTab(tab.id, e)}
                >
                  <Pencil class="h-3 w-3" />
                </button>
                {#if tabs.length > 1}
                  <button
                    type="button"
                    class="inline-flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-70 hover:opacity-100 transition-opacity"
                    onclick={(e) => closeTab(tab.id, e)}
                  >
                    <X class="h-3 w-3" />
                  </button>
                {/if}
              </div>
            {/if}
          </Tabs.Trigger>
        {/each}
      </Tabs.List>

      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        onclick={addNewTab}
        disabled={tabs.length >= MAX_TABS || isLoadingQueries}
      >
        <Plus class="h-4 w-4" />
      </Button>

      <div class="ml-auto flex items-center gap-2">
        {#if hasDirtyTabs}
          <Button
            variant="outline"
            size="sm"
            class="gap-2"
            onclick={handleSaveAllQueries}
            disabled={isSaving || isLoadingQueries}
          >
            <Save class="h-4 w-4" />
            {isSaving ? "Saving..." : "Save All"}
          </Button>
        {/if}

        <Button
          size="icon"
          variant="ghost"
          class="h-8 w-8"
          onclick={toggleTheme}
          aria-label="Toggle theme"
        >
          {#if isDark}
            <Moon class="h-4 w-4" />
          {:else}
            <Sun class="h-4 w-4" />
          {/if}
        </Button>
        <a
          href="https://github.com/multipliedtwice/prisma-query-builder-ui"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground h-8 w-8 transition-colors"
          aria-label="View on GitHub"
        >
          <Github class="h-4 w-4" />
        </a>
      </div>
    </div>

    {#each tabs as tab (tab.id)}
      <Tabs.Content
        value={tab.id}
        class="flex-1 m-0 p-0 data-[state=active]:flex"
      >
        <Resizable.PaneGroup direction="horizontal" class="h-full">
          <Resizable.Pane defaultSize={40} minSize={20} maxSize={60}>
            {#if tab.builder.state.operation}
              <ArgTree
                operation={tab.builder.state.operation}
                {parser}
                queryState={tab.builder.state}
                onaddarg={handleArgAdd}
                ontogglefield={handleFieldToggle}
                onbreadcrumbclick={handleBreadcrumbClick}
                onaddarrayitem={handleAddArrayItem}
                onremovearrayitem={handleRemoveArrayItem}
              />
            {:else}
              <div class="flex h-full items-center justify-center p-8">
                <p class="text-muted-foreground">
                  Select an operation to start building your query
                </p>
              </div>
            {/if}
          </Resizable.Pane>

          <Resizable.Handle withHandle />

          <Resizable.Pane defaultSize={60} minSize={40} maxSize={80}>
            <CodePreview
              queryState={tab.builder.state}
              onrun={handleRun}
              oneditpayload={handleEditPayload}
              bind:usePrismaSql
              hasWorkspace={currentWorkspaceId !== null}
              {isEmbedded}
              {embeddedHasDatabase}
            />
          </Resizable.Pane>
        </Resizable.PaneGroup>
      </Tabs.Content>
    {/each}
  </Tabs.Root>
</div>