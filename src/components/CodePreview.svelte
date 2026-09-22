<script lang="ts">
  import { generateCode } from "../lib/code-generator.js";
  import { parsePrismaQuery } from "../../packages/guard-editor/src/query/parse-code.js";
  import type { QueryState, Payload } from "../../packages/guard-editor/src/query/types.js";
  import { onMount, untrack } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState } from "@codemirror/state";
  import { javascript } from "@codemirror/lang-javascript";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { Wand, Copy, Play, Check } from "@lucide/svelte";
  import Button from "../lib/components/ui/button/button.svelte";
  import { Switch } from "../lib/components/ui/switch/index.js";
  import { Label } from "../lib/components/ui/label/index.js";

  let {
    queryState,
    onrun,
    readOnly = false,
    draft = null,
    ondraftchange,
    onvaliditychange,
    oneditpayload,
    usePrismaSql = $bindable(false),
    hasWorkspace = false,
    isEmbedded = false,
    embeddedHasDatabase = false,
  }: {
    queryState: QueryState;
    onrun?: (() => void) | undefined;
    readOnly?: boolean;
    draft?: string | null;
    ondraftchange?: ((code: string | null) => void) | undefined;
    onvaliditychange?: ((valid: boolean) => void) | undefined;
    oneditpayload: (payload: Payload) => void;
    usePrismaSql?: boolean;
    hasWorkspace?: boolean;
    isEmbedded?: boolean;
    embeddedHasDatabase?: boolean;
  } = $props();

  type CopyStatus = "idle" | "copying" | "success" | "error";
  let copyStatus = $state<CopyStatus>("idle");
  let parseError = $state<string | null>(null);
  let editorHasFocus = $state(false);
  let applyGeneration = 0;
  let disposed = false;

  let generatedCode = $derived(generateCode(queryState) || "");
  let canRun = $derived(queryState.operation !== null && !parseError && !readOnly);

  let editorContainer: HTMLDivElement | null = $state(null);
  let editorView: EditorView | null = $state(null);
  let isDark = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  let showPrismaSqlToggle = $derived(
    hasWorkspace || (isEmbedded && embeddedHasDatabase),
  );

  function getIsDark(): boolean {
    return document.documentElement.classList.contains("dark");
  }

  function updateEditorContent(content: string) {
    if (!editorView) return;
    const current = editorView.state.doc.toString();
    if (current === content) return;
    const transaction = editorView.state.update({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: content,
      },
    });
    editorView.dispatch(transaction);
  }

  function applyEditorContent(): boolean {
    if (readOnly) return false;
    try {
      const parsed = parsePrismaQuery(editorView?.state.doc.toString() ?? draft ?? generatedCode, queryState.operation);
      parseError = null;
      onvaliditychange?.(true);
      oneditpayload(parsed);
      return true;
    } catch (error) {
      parseError = error instanceof Error ? error.message : 'Invalid query arguments';
      onvaliditychange?.(false);
      return false;
    }
  }

  function createEditorTheme() {
    return EditorView.theme(
      {
        "&": {
          height: "100%",
          backgroundColor: "transparent",
        },
        ".cm-scroller": {
          fontFamily: "ui-monospace, monospace",
          fontSize: "12px",
          lineHeight: "1.6",
        },
        ".cm-content": {
          caretColor: "var(--foreground)",
        },
        ".cm-cursor": {
          borderLeftColor: "var(--foreground)",
        },
        ".cm-selectionBackground": {
          backgroundColor: "var(--accent)",
        },
        "&.cm-focused": {
          outline: "2px solid var(--ring)",
          outlineOffset: "-2px",
        },
        "&.cm-focused .cm-selectionBackground": {
          backgroundColor: "var(--accent)",
        },
        ".cm-gutters": {
          backgroundColor: "transparent",
          color: "var(--muted-foreground)",
          border: "none",
        },
      },
      { dark: isDark },
    );
  }

  function createEditor(content: string) {
    if (!editorContainer) return;

    if (editorView) {
      editorView.destroy();
    }

    const extensions = [
      basicSetup,
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({ "aria-label": "Prisma query", "aria-multiline": "true", "role": "textbox" }),
      EditorView.lineWrapping,
      javascript({ typescript: true }),
      createEditorTheme(),
      EditorView.updateListener.of((update) => {
        if (update.focusChanged) editorHasFocus = update.view.hasFocus;
        if (update.docChanged && update.view.hasFocus && !readOnly) {
          ondraftchange?.(update.state.doc.toString());
          onvaliditychange?.(false);
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            applyEditorContent();
          }, 600);
        }
      }),
    ];

    if (isDark) {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    editorView = new EditorView({
      state,
      parent: editorContainer,
    });
  }

  onMount(() => {
    isDark = getIsDark();
    if (editorContainer) {
      createEditor(draft ?? generatedCode);
      if (draft !== null) applyEditorContent();
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const newIsDark = getIsDark();
          if (newIsDark !== isDark) {
            isDark = newIsDark;
            if (editorView) {
              const content = editorView.state.doc.toString();
              createEditor(content);
            }
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      disposed = true; applyGeneration++;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }
      observer.disconnect();
    };
  });

  $effect(() => {
    const code = draft ?? generatedCode;
    if (editorView && !editorHasFocus) updateEditorContent(code);
    if (draft === null) { parseError = null; untrack(() => onvaliditychange?.(true)); }
  });

  $effect(() => {
    const immutable = readOnly;
    if (editorView && editorView.state.readOnly !== immutable) createEditor(editorView.state.doc.toString());
  });

  async function copyToClipboard() {
    const text = editorView?.state.doc.toString() || "";
    if (!text) return;

    if (!navigator.clipboard) {
      copyStatus = "error";
      setTimeout(() => (copyStatus = "idle"), 1500);
      return;
    }

    copyStatus = "copying";
    try {
      await navigator.clipboard.writeText(text);
      copyStatus = "success";
      setTimeout(() => (copyStatus = "idle"), 1500);
    } catch {
      copyStatus = "error";
      setTimeout(() => (copyStatus = "idle"), 1500);
    }
  }

  async function formatQuery() {
    const generation = ++applyGeneration;
    const text = editorView?.state.doc.toString() || "";
    if (!text.trim()) return;

    try {
      const prettier = await import("prettier/standalone");
      const pluginBabel = await import("prettier/plugins/babel");
      const pluginEstree = await import("prettier/plugins/estree");

      const formatted = await prettier.format(text, {
        parser: "babel-ts",
        plugins: [pluginBabel.default, pluginEstree.default],
        semi: true,
        singleQuote: false,
        trailingComma: "all",
        printWidth: 100,
        tabWidth: 2,
      });

      if (disposed || readOnly || generation !== applyGeneration || editorView?.state.doc.toString() !== text) return;
      updateEditorContent(formatted.trimEnd());
      ondraftchange?.(formatted.trimEnd());
      applyEditorContent();
    } catch {}
  }

  function handleRun() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (applyEditorContent()) onrun?.();
  }

  let copyAria = $derived(
    copyStatus === "copying"
      ? "Copying"
      : copyStatus === "success"
        ? "Copied"
        : copyStatus === "error"
          ? "Copy failed"
          : "Copy",
  );
</script>

<div class="@container flex flex-col bg-muted/30 h-full min-w-0">
  <div
    class="query-code-header h-[52px] shrink-0 flex items-center justify-between px-4 border-b border-border"
  >
    <div class="query-code-title flex items-center gap-2">
      <h3 class="text-sm font-semibold">Prisma Query</h3>
    </div>

    <div class="flex items-center gap-2">
      <Button
        size="icon"
        variant="ghost"
        class="h-8 w-8 max-sm:min-h-11 max-sm:min-w-11"
        disabled={readOnly}
        onclick={formatQuery}
        aria-label="Format"
        title="Format"
      >
        <Wand class="h-4 w-4" />
      </Button>

      <Button
        size="icon"
        variant="ghost"
        class="h-8 w-8 max-sm:min-h-11 max-sm:min-w-11"
        onclick={copyToClipboard}
        disabled={copyStatus === "copying"}
        aria-label={copyAria}
        title={copyAria}
      >
        {#if copyStatus === "success"}
          <Check class="h-4 w-4 text-green-500" />
        {:else}
          <Copy class="h-4 w-4" />
        {/if}
      </Button>

      {#if onrun}
      <Button
        size="icon"
        variant="default"
        class="h-8 w-8 max-sm:min-h-11 max-sm:min-w-11"
        onclick={handleRun}
        disabled={!canRun}
        aria-label="Run"
      >
        <Play class="h-4 w-4" />
      </Button>

      {/if}

      {#if onrun && showPrismaSqlToggle}
        <div class="flex items-center gap-2 px-2 py-1">
          <Switch
            id="prisma-sql-toggle"
            bind:checked={usePrismaSql}
            class="data-[state=checked]:bg-primary"
          />
          <Label
            for="prisma-sql-toggle"
            class="text-xs font-medium cursor-pointer select-none"
            title={usePrismaSql
              ? "Using prisma-sql (2-7x faster)"
              : "Using standard Prisma Client"}
          >
            prisma-sql
          </Label>
        </div>
      {/if}
    </div>
  </div>

  <div class="flex-1 overflow-hidden p-4 relative">
    <div
      class="h-full rounded-md border bg-background {parseError ? 'border-destructive' : 'border-border'}"
      bind:this={editorContainer}
    ></div>

    {#if parseError}
      <div
        class="absolute bottom-5 left-5 right-5 bg-destructive/10 border border-destructive rounded px-3 py-2"
      >
        <p role="alert" class="text-xs text-destructive">{parseError}</p>
      </div>
    {/if}
  </div>
</div>