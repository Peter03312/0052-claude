<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ActDiagnosis, StoryDraft } from '../lib/types';
  import {
    ACT_ROW_H,
    MARGIN_X,
    MARGIN_Y,
    RULER_H,
    SLEEVE_H,
    SLOT_W,
    maxSlotIndex,
    slotX
  } from '../lib/geometry';
  import { MAX_STOP, MIN_STOP } from '../lib/solver';

  export let draft: StoryDraft;
  export let columns: number;
  export let windowColumns: number[];
  export let stops: number[];
  /** 逐幕诊断；提供时会把冲突窗口标红 */
  export let diagnoses: ActDiagnosis[] | null = null;
  /** 当前选中要预览的幕（拖动停点时随之更新） */
  export let activeAct = 0;
  /** 是否允许拖动停点 */
  export let draggable = true;
  /** 无解取证模式：窗口位置画成浅色虚线，牌画建议尝试 */
  export let witness = false;

  const dispatch = createEventDispatcher<{
    stopchange: { act: number; stop: number };
    selectact: { act: number };
  }>();

  $: maxSlot = maxSlotIndex(stops, windowColumns);
  $: svgWidth = MARGIN_X * 2 + (maxSlot + 2) * SLOT_W;
  $: rowsHeight = draft.acts.length * ACT_ROW_H;
  $: svgHeight = MARGIN_Y * 2 + RULER_H + SLEEVE_H + 26 + rowsHeight + 30;

  const sleeveTop = MARGIN_Y + RULER_H;
  const sleeveLeft = MARGIN_X;
  const sleeveWidth = columns * SLOT_W;
  const stripTop = sleeveTop + SLEEVE_H + 26;

  function cardAt(ai: number, ci: number): { w: number; slot: number; bad: boolean } | null {
    if (diagnoses && diagnoses[ai]) {
      const w = diagnoses[ai].windows[ci];
      if (w === undefined || w < 0) return null;
      const slot = stops[ai] + windowColumns[w];
      const conflicts = diagnoses[ai].perCardConflicts[ci] ?? [];
      return { w, slot, bad: !diagnoses[ai].feasible && conflicts.length > 0 };
    }
    // 没有诊断时按允许集合第一个窗口画
    const allowed = draft.acts[ai].cards[ci].windows;
    if (!allowed.length) return null;
    const w = allowed[0];
    return { w, slot: stops[ai] + windowColumns[w], bad: false };
  }

  let dragging: { act: number; pointerId: number } | null = null;
  let svgEl: SVGSVGElement | null = null;

  function onPointerDown(e: PointerEvent, ai: number) {
    if (!draggable || ai === 0) return;
    dragging = { act: ai, pointerId: e.pointerId };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * svgWidth;
    const slotFloat = (x - MARGIN_X) / SLOT_W - 0;
    let next = Math.round(slotFloat);
    const lo = ai => (ai <= 1 ? MIN_STOP : stops[ai - 1] + 1);
    const hi = ai => (ai >= stops.length - 1 ? MAX_STOP : stops[ai + 1] - 1);
    const ai = dragging.act;
    next = Math.max(lo(ai), Math.min(hi(ai), next));
    if (next !== stops[ai]) {
      dispatch('stopchange', { act: ai, stop: next });
    }
  }

  function onPointerUp() {
    dragging = null;
  }

  function windowColor(w: number): string {
    return ['#3b82f6', '#10b981', '#f59e0b'][w % 3];
  }

  $: activeCardInfo = draft.acts.map((act, ai) =>
    act.cards.map((_, ci) => cardAt(ai, ci)));
</script>

<svg
  bind:this={svgEl}
  class="scene {witness ? 'witness' : ''}"
  viewBox="0 0 {svgWidth} {svgHeight}"
  role="img"
  aria-label="纸套、条带与停点联动图"
  on:pointermove={onPointerMove}
  on:pointerup={onPointerUp}
  on:pointercancel={onPointerUp}
>
  <!-- 列号尺子 -->
  <g class="ruler">
    {#each Array.from({ length: columns }, (_, c) => c) as c}
      <text
        x={MARGIN_X + c * SLOT_W + SLOT_W / 2}
        y={MARGIN_Y + 14}
        class:dim={activeAct === -1}
        class="col-label"
      >{c}</text>
    {/each}
  </g>

  <!-- 条带（先画，位于纸套后方） -->
  <g class="strip">
    <rect
      x={MARGIN_X}
      y={stripTop}
      width={(maxSlot + 1) * SLOT_W}
      height={rowsHeight + 8}
      rx="6"
      class="strip-bg"
    />
    {#each draft.acts as act, ai}
      {#each act.cards as card, ci}
        {@const info = activeCardInfo[ai][ci]}
        {#if info}
          <g
            class="card"
            class:on-stage={ai === activeAct}
            class:bad={!!info.bad}
            transform="translate({slotX(info.slot) - SLOT_W / 2 + 2},{stripTop + 4 +
              ai * ACT_ROW_H})"
          >
            <rect width={SLOT_W - 4} height={ACT_ROW_H - 4} rx="4"
              style="stroke:{windowColor(info.w)}" />
            <text x={(SLOT_W - 4) / 2} y={(ACT_ROW_H - 4) / 2 - 2} class="card-act">
              第{ai + 1}幕·{ci + 1}
            </text>
            <text x={(SLOT_W - 4) / 2} y={(ACT_ROW_H - 4) / 2 + 11} class="card-slot">
              槽 {info.slot}
            </text>
          </g>
        {/if}
      {/each}
    {/each}
  </g>

  <!-- 停点刻线与把手（贯穿纸套与条带） -->
  <g class="stops">
    {#each stops as stop, ai}
      <g
        class="stop-group"
        class:active-stop={ai === activeAct}
        role="presentation"
        on:click={() => dispatch('selectact', { act: ai })}
      >
        <line
          x1={MARGIN_X + stop * SLOT_W}
          y1={sleeveTop - 4}
          x2={MARGIN_X + stop * SLOT_W}
          y2={stripTop + rowsHeight + 8}
          class="stop-line"
        />
        <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
        <circle
          cx={MARGIN_X + stop * SLOT_W}
          cy={sleeveTop - 4}
          r={ai === 0 ? 7 : 10}
          class="stop-handle"
          class:draggable={draggable && ai > 0}
          role={ai > 0 && draggable ? 'slider' : undefined}
          aria-label={ai === 0 ? '第一幕停点固定为零' : `第${ai + 1}幕停点，当前为${stop}`}
          aria-valuenow={stop}
          tabindex={ai > 0 && draggable ? 0 : -1}
          on:pointerdown={(e) => onPointerDown(e, ai)}
          on:keydown={(e) => {
            if (!draggable || ai === 0) return;
            const lo = ai <= 1 ? MIN_STOP : stops[ai - 1] + 1;
            const hi = ai >= stops.length - 1 ? MAX_STOP : stops[ai + 1] - 1;
            if (e.key === 'ArrowLeft' && stops[ai] > lo)
              dispatch('stopchange', { act: ai, stop: stops[ai] - 1 });
            if (e.key === 'ArrowRight' && stops[ai] < hi)
              dispatch('stopchange', { act: ai, stop: stops[ai] + 1 });
          }}
        />
        <text
          x={MARGIN_X + stop * SLOT_W}
          y={sleeveTop - 20}
          class="stop-label"
        >停{stop}</text>
      </g>
    {/each}
  </g>

  <!-- 纸套：整块板 + 窗口挖空（覆盖在条带之上） -->
  <g class="sleeve">
    <rect x={sleeveLeft} y={sleeveTop} width={sleeveWidth} height={SLEEVE_H} rx="10"
      class="sleeve-bg" />
    {#each windowColumns as col, w}
      <g>
        <rect
          x={MARGIN_X + col * SLOT_W + 4}
          y={sleeveTop + 10}
          width={SLOT_W - 8}
          height={SLEEVE_H - 20}
          rx="6"
          class="window-hole"
          style="stroke:{windowColor(w)}"
        />
        <text
          x={MARGIN_X + col * SLOT_W + SLOT_W / 2}
          y={sleeveTop + SLEEVE_H / 2 - 2}
          class="window-no"
        >窗{w}</text>
        <text
          x={MARGIN_X + col * SLOT_W + SLOT_W / 2}
          y={sleeveTop + SLEEVE_H / 2 + 13}
          class="window-col"
        >列{col}</text>
      </g>
    {/each}
    <text x={sleeveLeft + 8} y={sleeveTop + 14} class="sleeve-title">纸套（{columns} 列）</text>
  </g>
</svg>

<style>
  .scene {
    width: 100%;
    height: auto;
    touch-action: none;
    user-select: none;
  }
  .ruler .col-label {
    font-size: 12px;
    fill: #94a3b8;
    text-anchor: middle;
  }
  .strip-bg {
    fill: #fef9c3;
    stroke: #ca8a04;
    stroke-dasharray: 4 3;
    stroke-width: 1.5;
  }
  .card rect {
    fill: #fff;
    stroke-width: 2;
  }
  .card.on-stage rect {
    fill: #eff6ff;
    stroke-width: 3;
  }
  .card.bad rect {
    fill: #fee2e2;
    stroke: #dc2626 !important;
  }
  .card-act {
    font-size: 9px;
    fill: #475569;
    text-anchor: middle;
  }
  .card-slot {
    font-size: 10px;
    font-weight: 700;
    fill: #0f172a;
    text-anchor: middle;
  }
  .stop-line {
    stroke: #94a3b8;
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .stop-group.active-stop .stop-line {
    stroke: #2563eb;
    stroke-width: 2;
    stroke-dasharray: none;
  }
  .stop-handle {
    fill: #fff;
    stroke: #64748b;
    stroke-width: 2;
  }
  .stop-handle.draggable {
    cursor: grab;
    stroke: #2563eb;
  }
  .stop-handle.draggable:active {
    cursor: grabbing;
  }
  .active-stop .stop-handle {
    fill: #2563eb;
  }
  .stop-label {
    font-size: 11px;
    font-weight: 700;
    fill: #334155;
    text-anchor: middle;
  }
  .sleeve-bg {
    fill: #e2e8f0;
    stroke: #64748b;
    stroke-width: 2;
  }
  .window-hole {
    fill: #fff;
    stroke-width: 2.5;
  }
  .window-no,
  .window-col {
    font-size: 10px;
    fill: #334155;
    text-anchor: middle;
  }
  .sleeve-title {
    font-size: 10px;
    fill: #64748b;
  }
  .scene.witness .sleeve-bg {
    fill: #f1f5f9;
    stroke-dasharray: 5 4;
  }
  @media (prefers-reduced-motion: no-preference) {
    .card {
      transition: transform 0.12s ease-out;
    }
  }
</style>
