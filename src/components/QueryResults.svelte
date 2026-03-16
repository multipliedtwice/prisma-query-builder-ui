<script lang="ts">
  import { Card } from "$lib/components/ui/card/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import Button from "$lib/components/ui/button/button.svelte";
  import { X, Table as TableIcon, Code, Zap, TriangleAlert } from "@lucide/svelte";
  import VirtualList from "svelte-tiny-virtual-list";

  let {
    result,
    isExecuting,
    onclose,
  }: {
    result: {
      success: boolean;
      data?: any;
      error?: string;
      executionTime?: number;
      usedPrismaSql?: boolean;
      warnings?: string[];
    } | null;
    isExecuting: boolean;
    onclose: () => void;
  } = $props();

  let viewMode = $state<"table" | "json">("table");
  let containerHeight = $state(0);
  let containerRef: HTMLDivElement | undefined;

  let isArrayOfObjects = $derived.by(() => {
    if (!result?.data) return false;
    if (!Array.isArray(result.data)) return false;
    if (result.data.length === 0) return false;
    return typeof result.data[0] === "object" && result.data[0] !== null;
  });

  let tableColumns = $derived.by(() => {
    if (!isArrayOfObjects || !result?.data) return [];
    const keys = new Set<string>();
    const sample = result.data.slice(0, 100);
    for (const row of sample) {
      for (const key of Object.keys(row)) {
        keys.add(key);
      }
    }
    return [...keys];
  });

  let tableData = $derived.by(() => {
    if (!isArrayOfObjects || !result?.data) return [];
    return result.data;
  });

  let formattedResult = $derived.by(() => {
    if (!result) return "";
    if (result.error) return result.error;
    if (result.data === undefined) return "No data";

    try {
      let data = result.data;
      let truncated = false;
      let truncatedCount = 0;

      if (Array.isArray(data) && data.length > 1000) {
        truncatedCount = data.length - 1000;
        data = data.slice(0, 1000);
        truncated = true;
      }

      const jsonStr = JSON.stringify(data, null, 2);

      if (truncated) {
        return `${jsonStr}\n\n... ${truncatedCount} more records (showing first 1000)`;
      }

      return jsonStr;
    } catch {
      return "Failed to format result";
    }
  });

  let statusColor = $derived(
    result?.success
      ? "text-green-600 dark:text-green-400"
      : result?.error
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground",
  );

  let hasWarnings = $derived(
    result?.warnings && result.warnings.length > 0
  );

  $effect(() => {
    if (containerRef) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          containerHeight = entry.contentRect.height;
        }
      });
      resizeObserver.observe(containerRef);
      return () => resizeObserver.disconnect();
    }
  });

  function formatCellValue(value: any): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
</script>

<div class="@container flex flex-col bg-background h-full">
  <div
    class="h-[60px] shrink-0 flex flex-row items-center justify-between gap-3 px-4 border-b border-border"
  >
    <div class="flex items-center gap-2">
      <h3 class="text-sm font-semibold">Query Results</h3>
      {#if result?.executionTime !== undefined}
        <span class="text-xs text-muted-foreground">
          {result.executionTime.toFixed(2)}ms
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      {#if isArrayOfObjects}
        <div class="flex items-center gap-1 border border-border rounded p-1">
          <Button
            size="icon"
            variant={viewMode === "table" ? "secondary" : "ghost"}
            class="h-6 w-6"
            onclick={() => (viewMode = "table")}
          >
            <TableIcon class="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant={viewMode === "json" ? "secondary" : "ghost"}
            class="h-6 w-6"
            onclick={() => (viewMode = "json")}
          >
            <Code class="h-3 w-3" />
          </Button>
        </div>
      {/if}

      <Button size="icon" variant="ghost" class="h-8 w-8" onclick={onclose}>
        <X class="h-4 w-4" />
      </Button>
    </div>
  </div>

  <div class="flex-1 overflow-hidden" bind:this={containerRef}>
    {#if isExecuting}
      <div class="flex items-center justify-center h-full">
        <p class="text-muted-foreground">Executing query...</p>
      </div>
    {:else if result}
      {#if result.error}
        <div class="p-4 h-full overflow-auto space-y-3">
          {#if hasWarnings}
            <div class="flex items-start gap-2 p-3 rounded-md border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20">
              <TriangleAlert class="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div class="text-xs text-yellow-800 dark:text-yellow-200 whitespace-pre-wrap">{result.warnings?.join("\n")}</div>
            </div>
          {/if}
          <Card class="p-4 border-destructive">
            <div class="flex flex-col items-start gap-2">
              <span class="text-destructive font-semibold">Error:</span>
              <pre
                class="text-sm text-destructive whitespace-pre-wrap break-words">{result.error}</pre>
            </div>
          </Card>
        </div>
      {:else}
        <div class="h-full flex flex-col">
          <div class="shrink-0 px-4 flex flex-col gap-2 pt-3 pb-2">
            <div class="flex items-center gap-2">
              <span class={`text-sm font-semibold ${statusColor}`}
                >Success</span
              >
              {#if Array.isArray(result.data)}
                <span class="text-xs text-muted-foreground">
                  ({result.data.length}
                  {result.data.length === 1 ? "record" : "records"})
                </span>
              {/if}
              {#if result.usedPrismaSql}
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                >
                  <Zap class="h-3 w-3" />
                  prisma-sql
                </span>
              {/if}
            </div>
            {#if hasWarnings}
              <div class="flex items-start gap-2 p-2 rounded-md border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20">
                <TriangleAlert class="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                <div class="text-xs text-yellow-800 dark:text-yellow-200 whitespace-pre-wrap">{result.warnings?.join("\n")}</div>
              </div>
            {/if}
          </div>

          <Separator />

          <div class="flex-1 overflow-hidden">
            {#if viewMode === "table" && isArrayOfObjects && containerHeight > 0}
              <div class="h-full overflow-auto">
                <div class="min-w-max">
                  <div
                    class="shrink-0 border-b border-border bg-muted/50 sticky top-0 z-10"
                  >
                    <div class="flex">
                      {#each tableColumns as col}
                        <div
                          class="min-w-[150px] px-3 py-2 text-xs font-semibold text-muted-foreground border-r border-border last:border-r-0"
                        >
                          {col}
                        </div>
                      {/each}
                    </div>
                  </div>

                  <VirtualList
                    width="auto"
                    height={containerHeight - 120}
                    itemCount={tableData.length}
                    itemSize={41}
                  >
                    <div
                      slot="item"
                      let:index
                      let:style
                      {style}
                      class="flex border-b border-border hover:bg-accent/50"
                    >
                      {#each tableColumns as col}
                        <div
                          class="min-w-[150px] px-3 py-2 text-xs text-foreground border-r border-border last:border-r-0 truncate"
                          title={formatCellValue(tableData[index][col])}
                        >
                          {formatCellValue(tableData[index][col])}
                        </div>
                      {/each}
                    </div>
                  </VirtualList>
                </div>
              </div>
            {:else}
              <div class="h-full overflow-auto p-4">
                <pre
                  class="p-3 rounded-md border border-border bg-background text-foreground text-xs leading-relaxed whitespace-pre-wrap">{formattedResult}</pre>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {:else}
      <div class="flex items-center justify-center h-full">
        <p class="text-muted-foreground text-sm">Run a query to see results</p>
      </div>
    {/if}
  </div>
</div>