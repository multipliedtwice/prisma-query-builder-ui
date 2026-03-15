<script lang="ts">
  import { generateCode } from "../lib/code-generator.ts";
  import type { QueryState, Payload } from "../lib/types.ts";
  import { onMount } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState } from "@codemirror/state";
  import { javascript } from "@codemirror/lang-javascript";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { isPlainObject } from "$lib/helpers.js";
  import { Wand, Copy, Play } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { getEmbeddedConfig } from "../lib/embedded-mode.js";

  let {
    queryState,
    onrun,
    onpayloadchange,
    usePrismaSql = $bindable(false),
    hasWorkspace = false,
    embeddedHasDatabase = false
  }: {
    queryState: QueryState;
    onrun: () => void;
    onpayloadchange: (payload: Payload) => void;
    usePrismaSql?: boolean;
    hasWorkspace?: boolean;
    embeddedHasDatabase?: boolean;
  } = $props();

  type CopyStatus = "idle" | "copying" | "success" | "error";
  let copyStatus = $state<CopyStatus>("idle");

  let generatedCode = $derived(generateCode(queryState) || "");
  let canRun = $derived(queryState.operation !== null);

  let editorContainer: HTMLDivElement | null = $state(null);
  let editorView: EditorView | null = $state(null);
  let isDark = $state(false);
  let lastGeneratedCode = $state("");
  let userEditTimeout: number | null = $state(null);
  let userIsEditing = $state(false);
  let syncError = $state(false);

  let embeddedConfig = $state({
    isEmbedded: false
  });

  let showPrismaSqlToggle = $derived(
    hasWorkspace || (embeddedConfig.isEmbedded && embeddedHasDatabase)
  );

  function getIsDark(): boolean {
    return document.documentElement.classList.contains("dark");
  }

  function parsePayloadFromCode(code: string): Payload | null {
    try {
      const match = code.match(/await\s+prisma\.\w+\.\w+\(([\s\S]*)\)/);
      if (!match) return null;

      let payloadStr = match[1].trim();
      if (!payloadStr) return {};

      payloadStr = payloadStr
        .replace(/(\w+):/g, '"$1":')
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, "$1")
        .replace(/undefined/g, "null");

      const parsed = JSON.parse(payloadStr);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

      const p = parsed as any;

      if (Array.isArray(p.orderBy) && p.orderBy.length === 1 && isPlainObject(p.orderBy[0])) {
        p.orderBy = p.orderBy[0];
      }

      if (Array.isArray(p.orderBy) && p.orderBy.length === 0) {
        delete p.orderBy;
      }

      return p as Payload;
    } catch (error) {
      return null;
    }
  }

  function createEditorTheme() {
    return EditorView.theme(
      {
        "&": {
          height: "100%",
          backgroundColor: "transparent"
        },
        ".cm-scroller": {
          fontFamily: "ui-monospace, monospace",
          fontSize: "12px",
          lineHeight: "1.6"
        },
        ".cm-content": {
          caretColor: "hsl(var(--foreground))"
        },
        ".cm-cursor": {
          borderLeftColor: "hsl(var(--foreground))"
        },
        ".cm-selectionBackground": {
          backgroundColor: "hsl(var(--accent))"
        },
        "&.cm-focused .cm-selectionBackground": {
          backgroundColor: "hsl(var(--accent))"
        },
        ".cm-gutters": {
          backgroundColor: "transparent",
          color: "hsl(var(--muted-foreground))",
          border: "none"
        }
      },
      { dark: isDark }
    );
  }

  function recreateEditor(content: string) {
    if (!editorContainer) return;

    if (editorView) {
      editorView.destroy();
    }

    const extensions = [
      basicSetup,
      javascript({ typescript: true }),
      createEditorTheme(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          userIsEditing = true;
          
          if (userEditTimeout !== null) {
            clearTimeout(userEditTimeout);
          }
          
          userEditTimeout = setTimeout(() => {
            const code = update.state.doc.toString();
            
            try {
              const payload = parsePayloadFromCode(code);
              if (payload !== null) {
                onpayloadchange(payload);
                syncError = false;
              } else {
                syncError = true;
              }
            } catch (error) {
              syncError = true;
            }
            
            userIsEditing = false;
            userEditTimeout = null;
          }, 500) as unknown as number;
        }
      })
    ];

    if (isDark) {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc: content,
      extensions
    });

    editorView = new EditorView({
      state,
      parent: editorContainer
    });
  }

  onMount(() => {
    embeddedConfig = getEmbeddedConfig();
    isDark = getIsDark();
    if (editorContainer) {
      lastGeneratedCode = generatedCode;
      recreateEditor(generatedCode);
    }

    const handleThemeChange = () => {
      const newIsDark = getIsDark();
      if (newIsDark !== isDark) {
        isDark = newIsDark;
        if (editorView) {
          recreateEditor(editorView.state.doc.toString());
        }
      }
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          handleThemeChange();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }
      if (userEditTimeout !== null) {
        clearTimeout(userEditTimeout);
      }
      observer.disconnect();
    };
  });

  $effect(() => {
    if (editorView && !userIsEditing && generatedCode !== lastGeneratedCode) {
      lastGeneratedCode = generatedCode;
      const transaction = editorView.state.update({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: generatedCode
        }
      });
      editorView.dispatch(transaction);
      syncError = false;
    }
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
        tabWidth: 2
      });

      if (editorView) {
        const transaction = editorView.state.update({
          changes: {
            from: 0,
            to: editorView.state.doc.length,
            insert: formatted.trimEnd()
          }
        });
        editorView.dispatch(transaction);
      }
    } catch {}
  }

  function handleRun() {
    onrun();
  }

  let copyAria = $derived(
    copyStatus === "copying"
      ? "Copying"
      : copyStatus === "success"
      ? "Copied"
      : copyStatus === "error"
      ? "Copy failed"
      : "Copy"
  );
</script>

<div class="@container flex flex-col bg-muted/30 h-full">
  <div class="h-[52px] shrink-0 flex items-center justify-between px-4 border-b border-border">
    <div class="flex items-center gap-2">
      <h3 class="text-sm font-semibold">Prisma Query</h3>
      {#if syncError}
        <span class="text-xs text-yellow-600 dark:text-yellow-400" title="Manual edits with complex syntax may not sync to visual builder">
          ⚠ Sync disabled
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <Button size="icon" variant="default" class="h-8 w-8" onclick={handleRun} disabled={!canRun} aria-label="Run">
        <Play class="h-4 w-4" />
      </Button>

      {#if showPrismaSqlToggle}
        <div class="flex items-center gap-2 px-2 py-1">
          <Switch 
            id="prisma-sql-toggle" 
            bind:checked={usePrismaSql}
            class="data-[state=checked]:bg-primary"
          />
          <Label 
            for="prisma-sql-toggle" 
            class="text-xs font-medium cursor-pointer select-none"
            title={usePrismaSql ? "Using prisma-sql (2-7x faster)" : "Using standard Prisma Client"}
          >
            prisma-sql
          </Label>
        </div>
      {/if}
    </div>
  </div>

  <div class="flex-1 overflow-hidden p-4 relative">
    <div class="h-full rounded-md border border-border bg-background relative" bind:this={editorContainer}>
      <div class="absolute top-2 right-2 z-10 flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          class="h-7 w-7"
          onclick={formatQuery}
          aria-label="Format"
          title="Format"
        >
          <Wand class="h-3.5 w-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          class="h-7 w-7"
          onclick={copyToClipboard}
          disabled={copyStatus === "copying"}
          aria-label={copyAria}
          title="Copy"
        >
          <Copy class="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  </div>
</div>