<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { StoryDraft } from '../lib/types';
  import {
    MAX_ACTS,
    MAX_CARDS,
    MAX_WINDOWS,
    MIN_ACTS,
    MIN_CARDS
  } from '../lib/solver';
  import { draftStore } from '../lib/stores';

  export let draft: StoryDraft;
  export let errors: { field: string; message: string }[] = [];

  const dispatch = createEventDispatcher<{ solve: void }>();

  function emit(fn: (d: StoryDraft) => void) {
    draftStore.change(fn);
  }

  // 用响应式 Map 显示错误：在 {#each} 上下文里直接读 Map 能被 Svelte 4 正确追踪；
  // 经闭包函数调用在编译器生成的子上下文中不会随 prop 更新重算，故不在模板里调函数。
  $: errorMap = new Map(errors.map((item) => [item.field, item.message]));
  $: cardCountError = errors.find((item) => item.field.endsWith('-cards'))?.message ?? '';
  function setText(ai: number, ci: number, value: string) {
    emit((d) => {
      d.acts[ai].cards[ci].text = value;
    });
  }

  function onTextInput(ai: number, ci: number, e: Event) {
    setText(ai, ci, (e.currentTarget as HTMLInputElement).value);
  }

  function toggleWindow(ai: number, ci: number, w: number) {
    emit((d) => {
      const card = d.acts[ai].cards[ci];
      const set = new Set(card.windows);
      if (set.has(w)) set.delete(w);
      else set.add(w);
      card.windows = [...set].sort((a, b) => a - b);
    });
  }

  function addAct() {
    if (draft.acts.length >= MAX_ACTS) return;
    emit((d) => {
      d.acts.push({ cards: [{ text: '', windows: [0] }] });
    });
  }

  function removeAct(ai: number) {
    if (draft.acts.length <= MIN_ACTS) return;
    emit((d) => {
      d.acts.splice(ai, 1);
    });
  }

  function addCard(ai: number) {
    if (draft.acts[ai].cards.length >= MAX_CARDS) return;
    emit((d) => {
      const nextWindow = d.acts[ai].cards.length % d.windowCount;
      d.acts[ai].cards.push({ text: '', windows: [nextWindow] });
    });
  }

  function removeCard(ai: number, ci: number) {
    if (draft.acts[ai].cards.length <= MIN_CARDS) return;
    emit((d) => {
      d.acts[ai].cards.splice(ci, 1);
    });
  }
</script>

<form class="editor" on:submit|preventDefault={() => dispatch('solve')}>
  <section class="block">
    <h2>1. 纸套上挖几个窗口？</h2>
    <div class="window-count" role="radiogroup" aria-label="窗口数量">
      {#each Array.from({ length: MAX_WINDOWS }, (_, i) => i + 1) as n}
        <label class="pill">
          <input
            type="radio"
            name="windowCount"
            value={n}
            checked={draft.windowCount === n}
            on:change={() => emit((d) => {
              d.windowCount = n;
              // 清掉超出范围的窗口选择
              d.acts.forEach((a) => a.cards.forEach((c) => {
                c.windows = c.windows.filter((w) => w < n);
                if (c.windows.length === 0) c.windows = [0];
              }));
            })}
          />
          <span>{n} 个</span>
        </label>
      {/each}
    </div>
    {#if errorMap.get('windowCount')}<p class="err">{errorMap.get('windowCount')}</p>{/if}
  </section>

  <section class="block">
    <h2>2. 写故事（{draft.acts.length} 幕，每幕 1～3 张短句牌）</h2>
    <div class="acts">
      {#each draft.acts as act, ai}
        <fieldset class="act">
          <legend>
            <span class="act-title">第 {ai + 1} 幕</span>
            {#if ai === 0}
              <span class="hint">这一幕的停点固定是 0</span>
            {/if}
            {#if draft.acts.length > MIN_ACTS}
              <button
                type="button"
                class="mini danger"
                aria-label={`删除第${ai + 1}幕`}
                on:click={() => removeAct(ai)}
              >删幕</button>
            {/if}
          </legend>

          {#each act.cards as card, ci}
            <div class="card-row">
              <label class="text-field">
                <span class="card-no">牌 {ci + 1}</span>
                <input
                  type="text"
                  maxlength="24"
                  placeholder="写一句短句（24 字以内）"
                  value={card.text}
                  data-testid={`text-${ai}-${ci}`}
                  on:input={(e) => onTextInput(ai, ci, e)}
                />
              </label>
              <div class="window-pick" role="group" aria-label={`第${ai + 1}幕第${ci + 1}张牌允许的窗口`}>
                {#each Array.from({ length: draft.windowCount }, (_, w) => w) as w}
                  <label class="check">
                    <input
                      type="checkbox"
                      checked={card.windows.includes(w)}
                      data-testid={`allow-${ai}-${ci}-${w}`}
                      on:change={() => toggleWindow(ai, ci, w)}
                    />
                    <span class="win-tag w{w}">窗{w}</span>
                  </label>
                {/each}
              </div>
              {#if act.cards.length > MIN_CARDS}
                <button type="button" class="mini" aria-label={`删除第${ai + 1}幕第${ci + 1}张牌`}
                  on:click={() => removeCard(ai, ci)}>×</button>
              {/if}
            </div>
            {#if errorMap.get(`card-${ai}-${ci}-text`)}
              <p class="err">{errorMap.get(`card-${ai}-${ci}-text`)}</p>
            {/if}
            {#if errorMap.get(`card-${ai}-${ci}-windows`)}
              <p class="err">{errorMap.get(`card-${ai}-${ci}-windows`)}</p>
            {/if}
          {/each}

          {#if act.cards.length < MAX_CARDS}
            <button type="button" class="mini add" data-testid={`add-card-${ai}`}
              on:click={() => addCard(ai)}>＋ 加一张牌</button>
          {/if}
        </fieldset>
      {/each}
    </div>
    {#if errorMap.get('acts')}<p class="err">{errorMap.get('acts')}</p>{/if}
    {#if cardCountError}
      <p class="err">{cardCountError}</p>
    {/if}

    {#if draft.acts.length < MAX_ACTS}
      <button type="button" class="mini add big" data-testid="add-act" on:click={addAct}>
        ＋ 再加一幕
      </button>
    {/if}
  </section>

  <section class="block actions">
    <button type="submit" class="primary" data-testid="solve-btn">帮我排一排！</button>
    <p class="tip">小工具会一起想好每一幕停在哪里、每张牌用哪个窗口，不会只顾头不顾尾。</p>
  </section>
</form>

<style>
  .editor h2 {
    font-size: 16px;
    margin: 0 0 10px;
    color: #0f172a;
  }
  .block {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 14px;
  }
  .pill input {
    position: absolute;
    opacity: 0;
  }
  .pill {
    position: relative;
    display: inline-flex;
  }
  .pill span {
    padding: 6px 14px;
    border: 2px solid #cbd5e1;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 600;
    color: #475569;
  }
  .pill input:checked + span {
    border-color: #2563eb;
    background: #dbeafe;
    color: #1d4ed8;
  }
  .pill input:focus-visible + span {
    outline: 3px solid #93c5fd;
  }
  .window-count {
    display: flex;
    gap: 10px;
  }
  .act {
    border: 2px dashed #cbd5e1;
    border-radius: 10px;
    padding: 10px 12px;
    margin: 0 0 10px;
  }
  legend {
    padding: 0 6px;
    font-weight: 700;
    color: #1e293b;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hint {
    font-size: 12px;
    color: #64748b;
    font-weight: 400;
  }
  .card-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
  }
  .text-field {
    flex: 1 1 220px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .text-field input {
    flex: 1;
    padding: 8px 10px;
    border: 2px solid #cbd5e1;
    border-radius: 8px;
    font-size: 14px;
  }
  .text-field input:focus {
    outline: none;
    border-color: #2563eb;
  }
  .card-no {
    font-size: 13px;
    font-weight: 700;
    color: #475569;
    min-width: 38px;
  }
  .window-pick {
    display: inline-flex;
    gap: 6px;
  }
  .check input {
    position: absolute;
    opacity: 0;
  }
  .check {
    position: relative;
  }
  .win-tag {
    display: inline-block;
    padding: 5px 10px;
    border-radius: 8px;
    border: 2px solid #cbd5e1;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    color: #475569;
    background: #fff;
  }
  .check input:checked + .w0 {
    border-color: #3b82f6;
    background: #dbeafe;
    color: #1d4ed8;
  }
  .check input:checked + .w1 {
    border-color: #059669;
    background: #d1fae5;
    color: #047857;
  }
  .check input:checked + .w2 {
    border-color: #d97706;
    background: #fef3c7;
    color: #b45309;
  }
  .check input:focus-visible + .win-tag {
    outline: 3px solid #93c5fd;
  }
  .mini {
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    border-radius: 8px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 13px;
    color: #334155;
  }
  .mini:hover {
    background: #e2e8f0;
  }
  .mini.danger {
    color: #b91c1c;
    border-color: #fca5a5;
    background: #fef2f2;
  }
  .mini.add {
    border-style: dashed;
    color: #2563eb;
    border-color: #93c5fd;
    background: #eff6ff;
  }
  .mini.big {
    padding: 8px 14px;
    font-size: 14px;
  }
  .err {
    color: #b91c1c;
    font-size: 13px;
    margin: 4px 0;
  }
  .actions {
    text-align: center;
  }
  .primary {
    font-size: 18px;
    font-weight: 700;
    padding: 12px 32px;
    border: none;
    border-radius: 999px;
    background: #2563eb;
    color: #fff;
    cursor: pointer;
    box-shadow: 0 4px 0 #1e40af;
  }
  .primary:active {
    transform: translateY(2px);
    box-shadow: 0 2px 0 #1e40af;
  }
  .tip {
    font-size: 13px;
    color: #64748b;
    margin: 10px 0 0;
  }
</style>
