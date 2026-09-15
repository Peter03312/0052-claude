<script lang="ts">
  import type { Solution, StoryDraft } from '../lib/types';
  import { PRINT } from '../lib/geometry';

  export let draft: StoryDraft;
  export let solution: Solution;

  const colMm = PRINT.sleeveColumnMm;
  const sleeveW = () => solution.columns * colMm;
  const sleeveH = PRINT.sleeveHeightMm;

  $: maxSlot = Math.max(...solution.assignments.map((a) => a.slot));
  $: stopSet = new Set(solution.stops);
  $: bandMm = PRINT.stripBandMm;

  /** 牌面字号：按字数自适应，保证长句也尽量完整显示在槽内 */
  function fontSizeFor(text: string): number {
    const n = text.length;
    if (n <= 6) return 9;
    if (n <= 9) return 7.5;
    if (n <= 13) return 6.5;
    return 5.5;
  }

  function textOf(ai: number, ci: number): string {
    return draft.acts[ai]?.cards[ci]?.text ?? '';
  }
</script>

<div class="print-root" data-testid="print-page">
  <!-- 第 1 页：纸套 -->
  <section class="page">
    <h1 class="print-title">① 纸套（沿外框裁切线剪下，窗口挖空，按粘贴区折粘）</h1>

    <div class="sleeve-sheet">
      <!-- 顶粘贴区 -->
      <div class="flap" style="height:{PRINT.glueFlapMm}mm;width:{sleeveW()}mm">
        粘贴区 ↑（涂胶后折到背面）
      </div>
      <div
        class="sleeve-cut"
        style="width:{sleeveW()}mm;height:{sleeveH}mm"
      >
        <!-- 裁切线角标 -->
        <span class="cut tl"></span><span class="cut tr"></span>
        <span class="cut bl"></span><span class="cut br"></span>

        {#each Array.from({ length: solution.columns }, (_, c) => c) as c}
          <div class="col-rule" style="left:{c * colMm}mm;width:{colMm}mm">
            <span class="col-no">{c}</span>
          </div>
        {/each}
        {#each solution.windowColumns as col, w}
          <div
            class="window-cut w{w}"
            style="left:{col * colMm + 2}mm;width:{colMm - 4}mm;top:6mm;height:{sleeveH - 12}mm"
          >
            <span>窗{w}</span>
            <small>挖空</small>
          </div>
        {/each}
      </div>
      <!-- 底粘贴区 -->
      <div class="flap bottom" style="height:{PRINT.glueFlapMm}mm;width:{sleeveW()}mm">
        粘贴区 ↓
      </div>
    </div>

    <ul class="notes">
      <li>纸套共 {solution.columns} 列，从 0 编号；窗口位置：
        {#each solution.windowColumns as col, w}窗{w}＝列{col}{w < solution.windowColumns.length - 1 ? '；' : ''}{/each}
      </li>
      <li>粗实线剪开，虚线折痕，灰色长条涂胶折到背面，做成能穿条带的套子。</li>
    </ul>
  </section>

  <!-- 第 2 页：条带 -->
  <section class="page">
    <h1 class="print-title">② 条带（所有牌印在同一横带上；剪下后穿进纸套，竖刻线对准纸套边缘时就是停点）</h1>

    <div class="strip-scroll">
      <!-- 粘贴片与条带在同一文档流内横向相邻，绝不使用负偏移，保证打印不被纸边裁掉 -->
      <div class="strip-sheet">
        <div class="strip-glue" style="height:{7 + bandMm}mm;width:{PRINT.glueFlapMm}mm">
          <span class="glue-label">起点涂胶折粘</span>
        </div>
        <div class="strip-main">
          <div class="strip-ruler" style="width:{(maxSlot + 1) * PRINT.stripColumnMm}mm">
            {#each Array.from({ length: maxSlot + 1 }, (_, s) => s) as s}
              <div class="strip-cell" style="left:{s * PRINT.stripColumnMm}mm;width:{PRINT.stripColumnMm}mm">
                <span class="slot-no">{s}</span>
                {#if stopSet.has(s)}
                  <span class="stop-tick">停{s}</span>
                {/if}
              </div>
            {/each}
          </div>

          <!--
            条带是单一横带：所有幕的牌都在与窗口等高的同一行内，只按槽位横向定位。
            纸套抽拉时，stop+窗口列 与槽位一一对应；若按幕分行，后面幕的牌会沉到窗口下方看不见。
          -->
          <div
            class="strip-body"
            style="width:{(maxSlot + 1) * PRINT.stripColumnMm}mm;height:{bandMm}mm"
          >
            <!-- 停点刻线（贯穿整条横带） -->
            {#each solution.stops as stop}
              <div class="stop-line" style="left:{stop * PRINT.stripColumnMm}mm;height:{bandMm}mm"></div>
            {/each}
            <!-- 牌：统一 top，仅槽位决定横向位置 -->
            {#each solution.assignments as a}
              <div
                class="printed-card w{a.window}"
                style="left:{a.slot * PRINT.stripColumnMm + 0.5}mm;top:0.5mm;width:{PRINT.stripColumnMm - 1}mm;height:{bandMm - 1}mm;font-size:{fontSizeFor(textOf(a.actIndex, a.cardIndex))}pt"
              >
                <b>{textOf(a.actIndex, a.cardIndex)}</b>
                <small>{a.slot}槽·第{a.actIndex + 1}幕</small>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <ul class="notes">
      <li>停点刻线依次在槽 {solution.stops.join('、')}；把“停 0”刻线对准纸套左缘时，恰好显示第 1 幕。</li>
      <li>所有牌都印在与纸套窗口等高的<b>同一横带</b>上；每个槽只印一张牌；
        抽拉时下一幕才出现，上一幕会被纸套遮住。</li>
      <li>左端斜纹小片是<b>起点粘贴片</b>（已印在纸张安全区内，不会被裁掉）：
        沿实线剪下，在它与条带之间的<b>虚线折痕</b>处向后折 180°，涂胶后包住条带端头压平即可粘接。</li>
      <li>若条带比一页纸长：打印时在系统对话框选“缩放以适合页面”，
        或把打印出的两段沿槽位数字对齐、用透明胶在背面接成长条。</li>
    </ul>
  </section>
</div>

<style>
  .print-root {
    background: #fff;
  }
  .page {
    page-break-after: always;
    padding: 6mm;
  }
  .print-title {
    font-size: 13pt;
    margin: 0 0 6mm;
  }
  .sleeve-sheet {
    display: flex;
    flex-direction: column;
  }
  .flap {
    background: repeating-linear-gradient(
      45deg, #e5e7eb, #e5e7eb 3mm, #f3f4f6 3mm, #f3f4f6 6mm
    );
    border: 1px dashed #6b7280;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9pt;
    color: #4b5563;
  }
  .flap.bottom {
    border-top: none;
  }
  .sleeve-cut {
    position: relative;
    border: 2px solid #111827;
    background: #fff;
  }
  .cut {
    position: absolute;
    width: 5mm;
    height: 5mm;
  }
  .cut.tl { top: -2px; left: -2px; border-top: 2px solid #111827; border-left: 2px solid #111827; }
  .cut.tr { top: -2px; right: -2px; border-top: 2px solid #111827; border-right: 2px solid #111827; }
  .cut.bl { bottom: -2px; left: -2px; border-bottom: 2px solid #111827; border-left: 2px solid #111827; }
  .cut.br { bottom: -2px; right: -2px; border-bottom: 2px solid #111827; border-right: 2px solid #111827; }
  .col-rule {
    position: absolute;
    top: 0;
    bottom: 0;
    border-right: 1px dashed #d1d5db;
  }
  .col-no {
    position: absolute;
    bottom: 1mm;
    right: 1mm;
    font-size: 8pt;
    color: #9ca3af;
  }
  .window-cut {
    position: absolute;
    border: 2px dashed #111827;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 9pt;
    background: repeating-linear-gradient(
      -45deg, #f9fafb, #f9fafb 2mm, #f3f4f6 2mm, #f3f4f6 4mm
    );
  }
  .window-cut small {
    font-size: 7pt;
    color: #6b7280;
  }
  .notes {
    font-size: 10pt;
    margin: 5mm 0 0;
  }
  .strip-scroll {
    overflow: visible;
  }
  .strip-sheet {
    display: flex;
    align-items: flex-start;
    width: max-content;
  }
  .strip-main {
    display: flex;
    flex-direction: column;
  }
  .strip-ruler {
    position: relative;
    height: 7mm;
    border-bottom: 1px solid #111827;
  }
  .strip-cell {
    position: absolute;
    top: 0;
    height: 100%;
    border-right: 1px solid #d1d5db;
  }
  .slot-no {
    position: absolute;
    top: 0.5mm;
    left: 1mm;
    font-size: 7pt;
    color: #9ca3af;
  }
  .stop-tick {
    position: absolute;
    top: 0;
    right: -3mm;
    font-size: 7pt;
    color: #1d4ed8;
    font-weight: 700;
  }
  .strip-body {
    position: relative;
    border: 1px solid #111827;
    border-top: none;
    border-left: none; /* 左边界由粘贴片折线承担 */
  }
  .stop-line {
    position: absolute;
    top: 0;
    border-left: 2px solid #1d4ed8;
  }
  .strip-glue {
    flex: 0 0 auto;
    background: repeating-linear-gradient(
      45deg, #e5e7eb, #e5e7eb 2mm, #f3f4f6 2mm, #f3f4f6 4mm
    );
    border: 1.5px solid #111827;
    border-right: 1.5px dashed #111827; /* 与条带相接处为折痕虚线 */
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7pt;
    color: #374151;
    text-align: center;
    writing-mode: vertical-rl;
    letter-spacing: 1pt;
  }
  .glue-label {
    writing-mode: vertical-rl;
  }
  .printed-card {
    position: absolute;
    border: 1.5px solid;
    border-radius: 1mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5mm;
    padding: 1mm 0.5mm;
    overflow: hidden;
    background: #fff;
  }
  .printed-card b {
    /* 字号由内联样式按字数自适应；允许换行以保证长句完整可见 */
    font-weight: 700;
    line-height: 1.1;
    text-align: center;
    word-break: break-all;
    overflow-wrap: anywhere;
  }
  .printed-card small {
    font-size: 5pt;
    color: #6b7280;
    line-height: 1;
  }
  .printed-card.w0 { border-color: #3b82f6; }
  .printed-card.w1 { border-color: #059669; }
  .printed-card.w2 { border-color: #d97706; }
  @media print {
    .page {
      page-break-after: always;
    }
  }
  @page {
    size: A4 landscape;
    margin: 10mm;
  }
</style>
