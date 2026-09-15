<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import SceneSvg from './SceneSvg.svelte';
  import type { InfeasibleReport, Solution, StoryDraft } from '../lib/types';
  import { diagnoseScene } from '../lib/solver';

  export let draft: StoryDraft;
  export let proof: Solution | InfeasibleReport;
  export let onPrint: () => void;

  const dispatch = createEventDispatcher<{ edit: void }>();

  // 有解时，停点可以被孩子拖来拖去做“试一试”（只改联动图，不改最优校样）
  let trialStops: number[] | null = null;
  let activeAct = 0;

  $: if (proof.kind === 'solution') {
    trialStops = [...proof.stops];
    activeAct = 0;
  }

  $: liveStops = trialStops ?? (proof.kind === 'solution' ? proof.stops : proof.stops);
  $: liveColumns = proof.kind === 'solution' ? proof.columns : 12;
  $: liveWindowColumns = proof.windowColumns;

  $: liveDiagnoses = proof.kind === 'solution'
    ? diagnoseScene(draft, liveStops, liveWindowColumns)
    : diagnoseScene(
      { windowCount: draft.windowCount, acts: draft.acts.slice(0, proof.prefixLength) },
      proof.stops,
      proof.windowColumns
    );

  function onStopChange(e: CustomEvent<{ act: number; stop: number }>) {
    if (!trialStops) return;
    trialStops = trialStops.map((s, i) => (i === e.detail.act ? e.detail.stop : s));
  }

  $: liveAllFeasible = proof.kind === 'solution'
    ? liveDiagnoses.every((d) => d.feasible)
    : false;

  function assignmentsFor(ai: number) {
    if (proof.kind !== 'solution') return [];
    return proof.assignments.filter((a) => a.actIndex === ai);
  }
</script>

{#if proof.kind === 'solution'}
  <section class="proof" data-testid="proof-ok">
    <div class="banner ok">
      <span class="big">🎉 排好啦！</span>
      <span>
        纸套 {proof.columns} 列，窗口在列 {proof.windowColumns.join('、')}；
        停点依次是 {proof.stops.join('、')}。
      </span>
    </div>

    <div class="metrics">
      <div class="metric"><b>{proof.columns + proof.stops[proof.stops.length - 1]}</b><span>列数＋最后停点</span></div>
      <div class="metric"><b>{proof.maxGap}</b><span>最大相邻停点差</span></div>
      <div class="metric"><b>{proof.triedVectors}</b><span>一起检查过的摆法</span></div>
    </div>

    <div class="legend">
      <span>👉 拖动蓝色圆点可以“试一试”移动停点，红点表示这样会露底或撞槽。</span>
    </div>

    <div class="svg-wrap" data-testid="scene">
      <SceneSvg
        {draft}
        columns={liveColumns}
        windowColumns={liveWindowColumns}
        stops={liveStops}
        diagnoses={liveDiagnoses}
        bind:activeAct
        on:stopchange={onStopChange}
        on:selectact={(e) => (activeAct = e.detail.act)}
      />
    </div>

    {#if !liveAllFeasible}
      <p class="warn" data-testid="trial-warning">
        这样摆不行哦：别的幕的句子会从窗口露出来，或者两张牌挤到同一个槽。松开手再试试别的位置吧。
      </p>
    {/if}

    <div class="tables">
      {#each draft.acts as act, ai}
        <table class="plan-table">
          <thead>
            <tr><th colspan="4">第 {ai + 1} 幕 · 停点 {proof.stops[ai]}</th></tr>
            <tr><th>牌</th><th>句子</th><th>窗口</th><th>印刷槽</th></tr>
          </thead>
          <tbody>
            {#each assignmentsFor(ai) as a}
              <tr>
                <td>{a.cardIndex + 1}</td>
                <td class="sentence">{act.cards[a.cardIndex].text}</td>
                <td>窗{a.window}（列{a.column}）</td>
                <td>{proof.stops[ai]}＋{a.column}＝<b>{a.slot}</b></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/each}
    </div>

    <div class="actions">
      <button class="secondary" on:click={() => dispatch('edit')}>← 回去改句子</button>
      <button class="primary" data-testid="print-btn" on:click={onPrint}>打印制作页</button>
    </div>
  </section>
{:else}
  <section class="proof" data-testid="proof-bad">
    <div class="banner bad">
      <span class="big">🤔 前 {proof.prefixLength} 幕怎么摆都不行</span>
      <span>
        就算把纸套放宽到 12 列也会露底或撞槽。看看下面红色的卡片和刻线，改一改句子的窗口选择吧。
      </span>
    </div>

    <div class="legend">
      <span>举个最接近成功的摆法：窗口在列 {proof.windowColumns.join('、')}，
        停点 {proof.stops.join('、')}。红字说明每张牌卡在哪里。</span>
    </div>

    <div class="svg-wrap">
      <SceneSvg
        draft={{ windowCount: draft.windowCount, acts: draft.acts.slice(0, proof.prefixLength) }}
        columns={12}
        windowColumns={proof.windowColumns}
        stops={proof.stops}
        diagnoses={liveDiagnoses}
        draggable={false}
        witness
        activeAct={-1}
      />
    </div>

    <div class="troubles">
      {#each proof.troubles as t}
        {@const card = draft.acts[t.actIndex].cards[t.cardIndex]}
        <div class="trouble" data-testid={`trouble-${t.actIndex}-${t.cardIndex}`}>
          <p class="t-head">
            第 {t.actIndex + 1} 幕第 {t.cardIndex + 1} 张牌
            「{card.text || '（还没写字）'}」
            可选窗口 {t.allowed.map((w) => `窗${w}`).join('、')}：
          </p>
          <ul>
            {#each dedupeConflicts(t.conflicts) as c}
              {#if c.type === 'reveal'}
                <li>
                  放到<b>窗{c.window}</b>会印在槽 <b>{c.slot}</b>；
                  第 {c.otherAct} 幕停在 <b>{c.otherStop}</b> 时，
                  它会从<b>列 {c.otherColumn}</b> 的窗口提前露出来。
                </li>
              {:else}
                <li>
                  放到<b>窗{c.window}</b>会印在槽 <b>{c.slot}</b>，
                  和同幕第 {(c.conflictingCards ?? []).filter((n, i, arr) => arr.indexOf(n) === i && n !== t.cardIndex + 1).join('、') || '另一'} 张牌挤在一起。
                </li>
              {/if}
            {/each}
          </ul>
        </div>
      {/each}
    </div>

    <div class="actions">
      <button class="secondary" data-testid="back-edit" on:click={() => dispatch('edit')}>
        ← 回去改一改
      </button>
    </div>
  </section>
{/if}

<script context="module" lang="ts">
  import type { Conflict } from '../lib/types';
  export function dedupeConflicts(conflicts: Conflict[]): Conflict[] {
    const seen = new Set<string>();
    const out: Conflict[] = [];
    for (const c of conflicts) {
      const key = c.type === 'reveal'
        ? `r-${c.window}-${c.slot}-${c.otherAct}-${c.otherColumn}`
        : `c-${c.window}-${c.slot}-${(c.conflictingCards ?? []).join(',')}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  }
</script>

<style>
  .proof {
    background: #fff;
    border-radius: 14px;
    border: 1px solid #e2e8f0;
    padding: 18px;
  }
  .banner {
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    align-items: baseline;
    font-size: 15px;
    color: #1e293b;
  }
  .banner.ok {
    background: #dcfce7;
    border: 2px solid #86efac;
  }
  .banner.bad {
    background: #fee2e2;
    border: 2px solid #fca5a5;
  }
  .big {
    font-size: 20px;
    font-weight: 800;
  }
  .metrics {
    display: flex;
    gap: 12px;
    margin: 14px 0;
    flex-wrap: wrap;
  }
  .metric {
    flex: 1 1 120px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px;
    text-align: center;
  }
  .metric b {
    display: block;
    font-size: 24px;
    color: #1d4ed8;
  }
  .metric span {
    font-size: 12px;
    color: #64748b;
  }
  .legend {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 14px;
    margin-bottom: 10px;
  }
  .svg-wrap {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow-x: auto;
    background: #f8fafc;
  }
  .warn {
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 14px;
  }
  .tables {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
    margin: 14px 0;
  }
  .plan-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .plan-table th,
  .plan-table td {
    border: 1px solid #e2e8f0;
    padding: 5px 8px;
    text-align: left;
  }
  .plan-table thead th {
    background: #eff6ff;
  }
  .sentence {
    max-width: 140px;
  }
  .actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 10px;
  }
  .primary {
    font-size: 16px;
    font-weight: 700;
    padding: 10px 24px;
    border: none;
    border-radius: 999px;
    background: #2563eb;
    color: #fff;
    cursor: pointer;
  }
  .secondary {
    font-size: 15px;
    padding: 10px 20px;
    border-radius: 999px;
    border: 2px solid #cbd5e1;
    background: #fff;
    cursor: pointer;
    color: #334155;
  }
  .troubles {
    margin: 12px 0;
  }
  .trouble {
    background: #fff7ed;
    border: 1px solid #fdba74;
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 10px;
  }
  .t-head {
    margin: 0 0 6px;
    font-weight: 700;
    color: #9a3412;
  }
  .trouble ul {
    margin: 0;
    padding-left: 20px;
  }
  .trouble li {
    font-size: 14px;
    color: #7c2d12;
    margin: 3px 0;
  }
</style>
