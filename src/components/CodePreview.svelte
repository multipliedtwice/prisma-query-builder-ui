<script lang="ts">
  import {
    englishQueryCopy,
    queryErrorText,
    queryEditorPhrases,
    type QueryTranslator,
  } from "../../packages/guard-editor/src/svelte/copy.js";
  import { generateCode } from "../lib/code-generator.js";
  import { parsePrismaQuery } from "../../packages/guard-editor/src/query/parse-code.js";
  import type {
    QueryState,
    Payload,
  } from "../../packages/guard-editor/src/query/types.js";
  import { onMount, untrack } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { Compartment, EditorState } from "@codemirror/state";
  import { javascript } from "@codemirror/lang-javascript";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { Wand, Copy, Play, Check } from "@lucide/svelte";
  import Button from "../lib/components/ui/button/button.svelte";
  import { Switch } from "../lib/components/ui/switch/index.js";
  import { Label } from "../lib/components/ui/label/index.js";

  let {
    translate = englishQueryCopy,
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
    translate?: QueryTranslator;
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
  let parseFailure = $state<Error | null>(null);
  const parseError = $derived(
    parseFailure ? queryErrorText(parseFailure, translate) : null,
  );
  const locale = new Compartment();
  let editorHasFocus = $state(false);
  let applyGeneration = 0;
  let disposed = false;

  let generatedCode = $derived(generateCode(queryState) || "");
  let canRun = $derived(
    queryState.operation !== null && !parseError && !readOnly,
  );

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
      const parsed = parsePrismaQuery(
        editorView?.state.doc.toString() ?? draft ?? generatedCode,
        queryState.operation,
      );
      parseFailure = null;
      onvaliditychange?.(true);
      oneditpayload(parsed);
      return true;
    } catch (error) {
      parseFailure =
        error instanceof Error
          ? error
          : new Error(translate("errorInvalid", { code: "query" }));
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
      locale.of([
        EditorState.phrases.of(queryEditorPhrases(translate)),
        EditorView.contentAttributes.of({
          "aria-label": translate("prismaQuery"),
          "aria-multiline": "true",
          role: "textbox",
        }),
      ]),
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
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
      disposed = true;
      applyGeneration++;
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
    if (draft === null) {
      parseFailure = null;
      untrack(() => onvaliditychange?.(true));
    }
  });

  $effect(() => {
    const immutable = readOnly;
    if (editorView && editorView.state.readOnly !== immutable)
      createEditor(editorView.state.doc.toString());
  });

  $effect(() => {
    const phrases = queryEditorPhrases(translate);
    const label = translate("prismaQuery");
    if (editorView)
      editorView.dispatch({
        effects: locale.reconfigure([
          EditorState.phrases.of(phrases),
          EditorView.contentAttributes.of({
            "aria-label": label,
            "aria-multiline": "true",
            role: "textbox",
          }),
        ]),
      });
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

      if (
        disposed ||
        readOnly ||
        generation !== applyGeneration ||
        editorView?.state.doc.toString() !== text
      )
        return;
      updateEditorContent(formatted.trimEnd());
      ondraftchange?.(formatted.trimEnd());
      applyEditorContent();
    } catch {}
  }

  function handleRun() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (applyEditorContent()) onrun?.();
  }

  let copyAria = $derived(
    copyStatus === "copying"
      ? translate("copying")
      : copyStatus === "success"
        ? translate("copied")
        : copyStatus === "error"
          ? translate("copyFailed")
          : translate("copy"),
  );
</script>

<div
  class="query-code-preview @container flex flex-col bg-muted/30 h-full min-w-0"
>
  <div
    class="query-code-header h-[52px] shrink-0 flex items-center justify-between px-4 border-b border-border"
  >
    <div class="query-code-title flex items-center gap-2">
      <h3 class="text-sm font-semibold">{translate("prismaQuery")}</h3>
    </div>

    <div class="flex items-center gap-2">
      <Button
        size="icon"
        variant="ghost"
        class="h-8 w-8 max-sm:min-h-11 max-sm:min-w-11"
        disabled={readOnly}
        onclick={formatQuery}
        aria-label={translate("format")}
        title={translate("format")}
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
          aria-label={translate("run")}
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
              ? translate("sqlClient")
              : translate("standardClient")}
          >
            prisma-sql
          </Label>
        </div>
      {/if}
    </div>
  </div>

  <div class="flex min-h-0 flex-1 flex-col gap-2 p-4">
    <div
      class="min-h-0 flex-1 rounded-md border bg-background {parseError
        ? 'border-destructive'
        : 'border-border'}"
      bind:this={editorContainer}
    ></div>

    {#if parseError}
      <div
        class="max-h-28 shrink-0 overflow-y-auto bg-destructive/10 border border-destructive rounded px-3 py-2"
        data-testid="query-code-error"
      >
        <p role="alert" class="text-xs text-destructive">{parseError}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  @container query-editor (max-width: 559px) {
    :global(.query-code-preview .cm-editor .cm-panels) {
      max-height: min(60%, 16rem);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    :global(.query-code-preview .cm-editor .cm-scroller) {
      min-height: 44px;
    }
    :global(.query-code-preview .cm-editor .cm-search) {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.375rem;
      position: relative;
      box-sizing: border-box;
      max-width: 100%;
      padding: 0.5rem 3.5rem 0.5rem 0.5rem;
      font-size: 0.875rem;
    }
    :global(
      .query-code-preview .cm-editor .cm-search input:not([type="checkbox"])
    ) {
      flex: 1 1 12rem;
      box-sizing: border-box;
      min-width: 0;
      max-width: 100%;
      min-height: 44px;
      font-size: 16px;
    }
    :global(.query-code-preview .cm-editor .cm-search button),
    :global(.query-code-preview .cm-editor .cm-search label) {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      min-height: 44px;
      min-width: 44px;
      max-width: 100%;
      white-space: normal;
      box-sizing: border-box;
    }
    :global(.query-code-preview .cm-editor .cm-search button) {
      padding: 0.375rem 0.5rem;
      font: inherit;
    }
    :global(
      .query-code-preview .cm-editor .cm-search label input[type="checkbox"]
    ) {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
    }
    :global(.query-code-preview .cm-editor .cm-search button[name="close"]) {
      position: absolute;
      top: 0.5rem;
      right: 0.25rem;
    }
  }
</style>
