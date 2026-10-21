<script lang="ts">
  import { englishQueryCopy, type QueryTranslator } from "../copy.js";
  import type { Snippet } from "svelte";
  let {
    builder,
    preview,
    mobilePane = "builder",
    translate = englishQueryCopy,
  }: {
    translate?: QueryTranslator;
    builder: Snippet;
    preview: Snippet;
    mobilePane?: "builder" | "preview";
  } = $props();
  const uid = $props.id();
  let width = $state(42);
  let drag: { pointer: number; left: number; width: number } | null = null;
  const clamp = (value: number) => Math.min(70, Math.max(28, value));
  function start(
    event: PointerEvent & { currentTarget: EventTarget & HTMLDivElement },
  ) {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds || bounds.width < 560) return;
    event.preventDefault();
    drag = { pointer: event.pointerId, left: bounds.left, width: bounds.width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (drag?.pointer === event.pointerId)
      width = clamp(((event.clientX - drag.left) / drag.width) * 100);
  }
  function stop(
    event: PointerEvent & { currentTarget: EventTarget & HTMLDivElement },
  ) {
    if (drag?.pointer !== event.pointerId) return;
    drag = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function resize(event: KeyboardEvent) {
    const next =
      event.key === "ArrowLeft"
        ? width - 2
        : event.key === "ArrowRight"
          ? width + 2
          : event.key === "Home"
            ? 28
            : event.key === "End"
              ? 70
              : null;
    if (next === null) return;
    event.preventDefault();
    width = clamp(next);
  }
</script>

<div
  class="guard-panes"
  data-mobile-pane={mobilePane}
  style={`--guard-builder-width: ${width}%`}
>
  <div class="guard-editor-pane" id={`${uid}-builder`}>{@render builder()}</div>
  <div
    class="guard-pane-handle"
    role="slider"
    tabindex="0"
    aria-label={translate("resizePanels")}
    aria-orientation="horizontal"
    aria-valuenow={Math.round(width)}
    aria-valuemin="28"
    aria-valuemax="70"
    aria-valuetext={translate("builderPercent", { percent: Math.round(width) })}
    aria-controls={`${uid}-builder`}
    onpointerdown={start}
    onpointermove={move}
    onpointerup={stop}
    onpointercancel={stop}
    onlostpointercapture={() => (drag = null)}
    onkeydown={resize}
  >
    <span aria-hidden="true">⋮</span>
  </div>
  <div class="guard-preview-pane">{@render preview()}</div>
</div>

<style>
  .guard-panes {
    display: grid;
    grid-template-columns: minmax(0, var(--guard-builder-width)) 10px minmax(
        0,
        1fr
      );
    min-height: 0;
    flex: 1;
    height: 100%;
    min-width: 0;
  }
  .guard-editor-pane,
  .guard-preview-pane {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .guard-pane-handle {
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: col-resize;
    touch-action: none;
    color: var(--muted-foreground);
    border-inline: 1px solid var(--border);
  }
  .guard-pane-handle:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  @container (max-width: 559px) {
    .guard-panes {
      display: flex;
      flex-direction: column;
    }
    .guard-pane-handle {
      display: none;
    }
    .guard-editor-pane,
    .guard-preview-pane {
      flex: 1;
    }
    [data-mobile-pane="builder"] .guard-preview-pane,
    [data-mobile-pane="preview"] .guard-editor-pane {
      display: none;
    }
  }
</style>
