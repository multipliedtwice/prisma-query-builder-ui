<script lang="ts">
  import {
    englishQueryCopy,
    type QueryTranslator,
  } from "../../packages/guard-editor/src/svelte/copy.js";
  let {
    tabs,
    activeId,
    panelId,
    onselect,
    onrename,
    onclose,
    translate = englishQueryCopy,
  }: {
    translate?: QueryTranslator;
    tabs: { id: string; name: string; dirty: boolean; disabled?: boolean }[];
    activeId: string;
    panelId: string;
    onselect: (id: string) => void;
    onrename?: ((id: string, name: string) => void) | undefined;
    onclose?: ((id: string) => void) | undefined;
  } = $props();
  let editing = $state<string | null>(null);
  let name = $state("");
  function rename(id: string) {
    if (editing !== id) return;
    editing = null;
    if (name.trim()) onrename?.(id, name.trim());
  }
  function focusName(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
  function navigate(event: KeyboardEvent, id: string) {
    const enabled = tabs.filter((tab) => !tab.disabled);
    const index = enabled.findIndex((tab) => tab.id === id);
    const target =
      event.key === "Home"
        ? enabled[0]
        : event.key === "End"
          ? enabled.at(-1)
          : event.key === "ArrowLeft"
            ? enabled[(index - 1 + enabled.length) % enabled.length]
            : event.key === "ArrowRight"
              ? enabled[(index + 1) % enabled.length]
              : undefined;
    if (!target) return;
    event.preventDefault();
    onselect(target.id);
    const list =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget.closest('[role="tablist"]')
        : null;
    const button = [
      ...(list?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []),
    ].find((item) => item.dataset.queryId === target.id);
    button?.focus();
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
</script>

<div
  class="query-tab-list"
  role="tablist"
  aria-label={translate("openQueries")}
>
  {#each tabs as tab (tab.id)}
    <div
      class="query-tab"
      class:active={activeId === tab.id}
      role="presentation"
    >
      <button
        type="button"
        role="tab"
        data-query-id={tab.id}
        aria-selected={activeId === tab.id}
        aria-controls={panelId}
        tabindex={activeId === tab.id ? 0 : -1}
        disabled={tab.disabled}
        title={tab.name}
        onclick={() => onselect(tab.id)}
        onkeydown={(event) => navigate(event, tab.id)}
      >
        <span class="query-tab-name">{tab.name}</span>{#if tab.dirty}<span
            aria-hidden="true">•</span
          ><span class="query-tab-hidden">, {translate("unsaved")}</span>{/if}
      </button>
      {#if editing === tab.id}
        <input
          use:focusName
          aria-label={translate("queryName")}
          bind:value={name}
          maxlength="512"
          onblur={() => rename(tab.id)}
          onkeydown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              rename(tab.id);
            }
            if (event.key === "Escape") editing = null;
          }}
        />
      {:else if onrename && activeId === tab.id}
        <button
          type="button"
          class="query-tab-action"
          aria-label={translate("renameNamed", { name: tab.name })}
          onclick={() => {
            name = tab.name;
            editing = tab.id;
          }}>✎</button
        >
      {/if}
      {#if onclose}<button
          type="button"
          class="query-tab-action"
          aria-label={translate("closeNamed", { name: tab.name })}
          onclick={() => onclose?.(tab.id)}>×</button
        >{/if}
    </div>
  {/each}
</div>

<style>
  .query-tab-list {
    display: flex;
    gap: 0.375rem;
    min-width: 0;
    overflow-x: auto;
    padding: 0.4rem;
    border-bottom: 1px solid var(--border);
    background: var(--muted);
  }
  .query-tab {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    max-width: 240px;
    border: 1px solid transparent;
    border-radius: 0.375rem;
  }
  .query-tab.active {
    background: var(--background);
    border-color: var(--border);
  }
  .query-tab > button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    padding: 0.5rem 0.625rem;
    font-size: 0.8125rem;
    min-height: 36px;
  }
  .query-tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .query-tab .query-tab-action {
    flex-shrink: 0;
  }
  .query-tab-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  .query-tab input {
    width: 150px;
    min-width: 0;
    padding: 0.25rem;
    background: var(--background);
    border: 1px solid var(--border);
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  @media (max-width: 640px) {
    .query-tab > button {
      min-height: 44px;
    }
    .query-tab-action {
      min-width: 44px;
    }
  }
</style>
