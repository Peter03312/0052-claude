<script lang="ts">
  import StoryEditor from './components/StoryEditor.svelte';
  import ProofView from './components/ProofView.svelte';
  import { draftStore, proofStore, errorStore, savedDraftInfo } from './lib/stores';
  import { solve, validateDraft } from './lib/solver';
  import { printOffline, renderPrintHtml } from './lib/print';

  let solving = false;
  let restoreBanner = savedDraftInfo() !== null;
  let savedAt = savedDraftInfo()?.savedAt ?? 0;

  function doSolve() {
    const draft = $draftStore;
    const found = validateDraft(draft);
    errorStore.set(found);
    if (found.length > 0) {
      proofStore.clear();
      return;
    }
    solving = true;
    // 让“想办法”动画先画一帧（最坏搜索约 1 秒多，避免界面假死让孩子以为坏掉）
    setTimeout(() => {
      const result = solve(draft);
      proofStore.set(result);
      solving = false;
      requestAnimationFrame(() => {
        document.querySelector('[data-testid="proof-ok"],[data-testid="proof-bad"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }, 30);
  }

  function doPrint() {
    const proof = $proofStore;
    if (!proof || proof.kind !== 'solution') return;
    printOffline('抽拉故事卡 · 打印制作页', renderPrintHtml($draftStore, proof));
  }

  function dismissRestore() {
    restoreBanner = false;
  }

  function resetAll() {
    if (!confirm('要清空现在的故事，重新开始吗？这个操作不能撤销哦。')) return;
    draftStore.reset();
    restoreBanner = false;
  }
</script>

<main class="app">
  <header>
    <div class="topbar">
      <h1>🎴 抽拉故事卡 · 纸套排版小工具</h1>
      <button type="button" class="reset-btn" data-testid="reset-btn" on:click={resetAll}>
        重新开始
      </button>
    </div>
    <p class="subtitle">
      把 2～6 幕小故事排进带窗口的纸套：拉一下出一幕，既不提前露台词，也不会两张牌挤同一个槽。
      全部计算都在这台设备上完成，断网也能用。
    </p>
  </header>

  {#if restoreBanner && !$proofStore}
    <div class="restore" data-testid="restore-banner">
      <span>✍️ 发现上次没做完的草稿（{new Date(savedAt).toLocaleString('zh-CN')}），已经帮你恢复在下面啦。</span>
      <button class="mini" on:click={dismissRestore}>知道了</button>
    </div>
  {/if}

  <div class="layout">
    <div class="col-input">
      <StoryEditor draft={$draftStore} errors={$errorStore} on:solve={doSolve} />
      {#if solving}
        <div class="thinking" data-testid="thinking" aria-live="polite">
          <span class="spinner"></span>
          正在把纸套、停点和窗口一起想一遍……
        </div>
      {/if}
    </div>

    <div class="col-proof">
      {#if $proofStore}
        <ProofView
          draft={$draftStore}
          proof={$proofStore}
          on:edit={() => proofStore.clear()}
          onPrint={doPrint}
        />
      {:else}
        <aside class="howto" aria-label="玩法说明">
          <h2>怎么玩？</h2>
          <ol>
            <li><b>写牌：</b>每一幕写 1～3 张短句牌。</li>
            <li><b>挑窗口：</b>给每张牌挑它允许出现在纸套的哪个窗口。</li>
            <li><b>一起想：</b>点“帮我排一排”，小工具会联合寻找每幕的停点和每张牌的窗口，
              先让纸套最短、最后停点最小，再让相邻停点最均匀。</li>
            <li><b>做出来：</b>看联动图、拖停点试玩，满意后打印制作页，剪、粘、抽拉！</li>
          </ol>
          <p class="rule">
            小规矩：窗口列号互不相同且从 0 编号；第一幕停点是 0，后面的停点严格递增；
            印刷槽 = 本幕停点 + 窗口列；每个槽只能放一张牌；别的幕停住时，其他句子不能从任何窗口露出来。
          </p>
        </aside>
      {/if}
    </div>
  </div>

  <footer>
    <p>纯离线小工具 · 不联网、不上传内容 · 适合 8～11 岁孩子和家长一起玩</p>
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
    background: #f1f5f9;
    color: #0f172a;
  }
  :global(*) {
    box-sizing: border-box;
  }
  .app {
    max-width: 1240px;
    margin: 0 auto;
    padding: 20px 18px 40px;
  }
  header h1 {
    margin: 0 0 6px;
    font-size: 26px;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .reset-btn {
    border: 2px solid #cbd5e1;
    background: #fff;
    color: #475569;
    border-radius: 999px;
    padding: 6px 16px;
    font-size: 14px;
    cursor: pointer;
  }
  .reset-btn:hover {
    border-color: #f87171;
    color: #b91c1c;
    background: #fef2f2;
  }
  .subtitle {
    margin: 0 0 16px;
    color: #475569;
    font-size: 14px;
  }
  .restore {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #ecfeff;
    border: 1px solid #67e8f9;
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 14px;
    font-size: 14px;
    color: #155e75;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(320px, 460px) 1fr;
    gap: 18px;
    align-items: start;
  }
  @media (max-width: 960px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .howto {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 18px 22px;
    position: sticky;
    top: 12px;
  }
  .howto h2 {
    margin: 0 0 10px;
    font-size: 18px;
  }
  .howto ol {
    margin: 0;
    padding-left: 22px;
    line-height: 1.9;
    font-size: 14px;
    color: #334155;
  }
  .rule {
    margin-top: 14px;
    padding: 10px 12px;
    background: #f8fafc;
    border-radius: 8px;
    font-size: 13px;
    color: #475569;
    line-height: 1.7;
  }
  .thinking {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #eff6ff;
    border: 1px solid #93c5fd;
    color: #1d4ed8;
    border-radius: 10px;
    padding: 10px 14px;
    margin-top: 10px;
    font-size: 14px;
  }
  .spinner {
    width: 18px;
    height: 18px;
    border: 3px solid #bfdbfe;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .mini {
    border: 1px solid #67e8f9;
    background: #fff;
    border-radius: 8px;
    padding: 4px 12px;
    cursor: pointer;
    color: #155e75;
  }
  footer {
    margin-top: 26px;
    text-align: center;
    font-size: 12px;
    color: #94a3b8;
  }
</style>
