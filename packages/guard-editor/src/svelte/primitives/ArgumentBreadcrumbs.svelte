<script lang="ts">
  import { englishQueryCopy, type QueryTranslator } from "../copy.js";
  import type { Snippet } from "svelte";
  let {
    root,
    path = [],
    onNavigate,
    actions,
    translate = englishQueryCopy,
  }: {
    translate?: QueryTranslator;
    root: string;
    path?: string[];
    onNavigate: (index: number) => void;
    actions?: Snippet;
  } = $props();

  const segmentLabel = (segment: string) =>
    /^\d+$/.test(segment) ? `[${segment}]` : segment;
</script>

<div class="query-navigation">
  <nav class="query-breadcrumbs" aria-label={translate("queryPath")}>
    <button
      type="button"
      aria-current={path.length ? undefined : "true"}
      onclick={() => onNavigate(-1)}>{root}</button
    >
    {#each path as segment, index}
      <span aria-hidden="true">/</span>
      <button
        type="button"
        aria-current={index === path.length - 1 ? "true" : undefined}
        onclick={() => onNavigate(index)}>{segmentLabel(segment)}</button
      >
    {/each}
  </nav>
  {#if actions}<div class="query-navigation-actions">
      {@render actions()}
    </div>{/if}
</div>

<style>
  .query-navigation {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-height: 52px;
    padding: 0.25rem 0.75rem;
    border-bottom: 1px solid var(--border, #e5e5e5);
    box-sizing: border-box;
    gap: 0 0.5rem;
  }
  .query-navigation-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-left: auto;
  }
  .query-navigation-actions:empty {
    display: none;
  }
  .query-breadcrumbs {
    flex: 1 1 120px;
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0 0.25rem;
    min-height: 44px;
    box-sizing: border-box;
    font-size: 0.8125rem;
  }
  button {
    appearance: none;
    font: inherit;
    text-align: start;
    min-height: 44px;
    min-width: 0;
    max-width: 100%;
    padding: 0.5rem;
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--muted-foreground, #737373);
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  button[aria-current] {
    color: var(--foreground, #171717);
    font-weight: 500;
  }
  button:hover {
    background: var(--accent, #f5f5f5);
    color: var(--accent-foreground, #171717);
  }
  button:focus-visible {
    outline: 2px solid var(--ring, #737373);
    outline-offset: -2px;
  }
  span {
    color: var(--muted-foreground, #737373);
  }
</style>
