import type {
  ActDiagnosis,
  CardAssignment,
  CardPlacement,
  CardTrouble,
  Conflict,
  DraftError,
  InfeasibleReport,
  Solution,
  SolveResult,
  StoryDraft
} from './types';

/** 纸套列数范围（从零编号，所以列号是 0…L-1） */
export const MIN_COLUMNS = 6;
export const MAX_COLUMNS = 12;
/** 第一幕停点恒为 0，其余停点范围 */
export const MIN_STOP = 1;
export const MAX_STOP = 12;
/** 业务范围 */
export const MIN_ACTS = 2;
export const MAX_ACTS = 6;
export const MIN_CARDS = 1;
export const MAX_CARDS = 3;
export const MIN_WINDOWS = 1;
export const MAX_WINDOWS = 3;
/** 牌面短句长度 */
export const MAX_TEXT_LEN = 24;

/** 校验录入草稿，返回给孩子看的温和提示 */
export function validateDraft(draft: StoryDraft): DraftError[] {
  const errors: DraftError[] = [];
  if (!Number.isInteger(draft.windowCount) ||
    draft.windowCount < MIN_WINDOWS || draft.windowCount > MAX_WINDOWS) {
    errors.push({
      field: 'windowCount',
      message: `窗口数量要在 ${MIN_WINDOWS} 到 ${MAX_WINDOWS} 个之间哦。`
    });
  }
  if (!Array.isArray(draft.acts) || draft.acts.length < MIN_ACTS || draft.acts.length > MAX_ACTS) {
    errors.push({
      field: 'acts',
      message: `故事要有 ${MIN_ACTS} 到 ${MAX_ACTS} 幕。`
    });
    return errors;
  }
  draft.acts.forEach((act, ai) => {
    if (!act.cards || act.cards.length < MIN_CARDS || act.cards.length > MAX_CARDS) {
      errors.push({
        field: `act-${ai}-cards`,
        message: `第 ${ai + 1} 幕要有 ${MIN_CARDS} 到 ${MAX_CARDS} 张牌。`
      });
      return;
    }
    act.cards.forEach((card, ci) => {
      if (!card.text.trim()) {
        errors.push({
          field: `card-${ai}-${ci}-text`,
          message: `第 ${ai + 1} 幕第 ${ci + 1} 张牌还没有写句子。`
        });
      } else if (card.text.length > MAX_TEXT_LEN) {
        errors.push({
          field: `card-${ai}-${ci}-text`,
          message: `第 ${ai + 1} 幕第 ${ci + 1} 张牌的句子太长啦（${MAX_TEXT_LEN} 个字以内更好印）。`
        });
      }
      const ws = [...new Set(card.windows)].sort((a, b) => a - b);
      if (ws.length === 0) {
        errors.push({
          field: `card-${ai}-${ci}-windows`,
          message: `第 ${ai + 1} 幕第 ${ci + 1} 张牌至少要挑一个允许的窗口。`
        });
      } else if (ws.some((w) => !Number.isInteger(w) || w < 0 || w >= draft.windowCount)) {
        errors.push({
          field: `card-${ai}-${ci}-windows`,
          message: `第 ${ai + 1} 幕第 ${ci + 1} 张牌挑了不存在的窗口，请重新挑。`
        });
      }
    });
  });
  return errors;
}

/** 从升序 items 中取 k 个的全部组合（保持升序） */
export function combinations<T>(items: T[], k: number): T[][] {
  const result: T[][] = [];
  const current: T[] = [];
  const walk = (start: number, depth: number) => {
    if (depth === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i <= items.length - (k - depth); i++) {
      current.push(items[i]);
      walk(i + 1, depth + 1);
      current.pop();
    }
  };
  walk(0, 0);
  return result;
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** 末停点恰为 lastStop 的全部严格递骤停点向量（首位恒为 0），字典序升序 */
function stopVectorsWithLastClean(actCount: number, lastStop: number): number[][] {
  if (actCount === 2) return [[0, lastStop]];
  const pool: number[] = [];
  for (let v = MIN_STOP; v <= lastStop - 1; v++) pool.push(v);
  return combinations(pool, actCount - 2).map((combo) => [0, ...combo, lastStop]);
}

/** 全部停点向量（末位升序，同末位字典序升序） */
function allStopVectorsOrdered(actCount: number): number[][] {
  const out: number[][] = [];
  for (let last = actCount - 1; last <= MAX_STOP; last++) {
    out.push(...stopVectorsWithLastClean(actCount, last));
  }
  return out;
}

/**
 * 现场级露出预算：
 * 一张放在“幕 a、窗口 w”的牌，其槽为 stops[a]+cols[w]；
 * 它会不会在别的停点露出，只与 (a, w) 有关，与具体是哪张牌无关。
 * 返回 Uint8Array，索引 a*k+w 为 1 表示该幕该窗口必在别的停点露出。
 */
function buildForbidden(stops: number[], cols: number[]): Uint8Array {
  const n = stops.length;
  const k = cols.length;
  const forbidden = new Uint8Array(n * k);
  const windowSet = new Set(cols);
  for (let a = 0; a < n; a++) {
    for (let w = 0; w < k; w++) {
      const slot = stops[a] + cols[w];
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        if (windowSet.has(slot - stops[b])) {
          forbidden[a * k + w] = 1;
          break;
        }
      }
    }
  }
  return forbidden;
}

interface MatchResult {
  /** 每张牌分到的窗口编号（牌录入顺序）；失败时为部分尝试 */
  windows: number[];
  /** 第一张无法获得干净互异窗口的牌（成功时为 -1） */
  failedCard: number;
}

/**
 * 为一幕的牌找互异、且不会在别的停点露出的窗口。
 * 牌按录入顺序、窗口按编号升序回溯：第一个成功解即（牌序,窗口）字典序最小。
 *
 * 化简依据：跨幕两张牌若槽位相同，则在彼此停点都落在窗口列上（必构成露出），
 * 故“不露”已排除一切跨幕撞槽；同幕槽位 = 停点 + 互异列，
 * 所以同幕只需窗口互异。
 */
function matchCards(
  allowedByCard: number[][],
  forbidden: Uint8Array,
  actIndex: number,
  k: number
): MatchResult {
  const m = allowedByCard.length;
  const used = new Uint8Array(k);
  const windows = new Array(m).fill(-1);

  const dfs = (ci: number): boolean => {
    if (ci === m) return true;
    const base = actIndex * k;
    for (const w of allowedByCard[ci]) {
      if (used[w] || forbidden[base + w]) continue;
      used[w] = 1;
      windows[ci] = w;
      if (dfs(ci + 1)) return true;
      used[w] = 0;
      windows[ci] = -1;
    }
    return false;
  };

  if (dfs(0)) return { windows, failedCard: -1 };
  return { windows, failedCard: windows.findIndex((w) => w === -1) };
}

interface Plan {
  columns: number;
  windowColumns: number[];
  stops: number[];
  /** 每幕每张牌的窗口编号 */
  windows: number[][];
  maxGap: number;
  /** 主键 = 列数 + 最后停点 */
  primary: number;
}

interface SolveWithColumnsResult {
  plan: Plan | null;
  /** 实际评估过的停点向量条数 */
  examined: number;
}

/** 固定列数与窗口列时，联合搜索全部停点与窗口分配（绝不逐幕定停点） */
export function solveWithColumns(
  draft: StoryDraft,
  columns: number,
  windowColumns: number[],
  capPrimary: number = Infinity
): SolveWithColumnsResult {
  const n = draft.acts.length;
  const k = windowColumns.length;
  const allowed = draft.acts.map((act) =>
    act.cards.map((card) => [...new Set(card.windows)].sort((a, b) => a - b)));

  let best: Plan | null = null;
  let bestSecondary: number[] | null = null;
  let examined = 0;

  for (let last = n - 1; last <= MAX_STOP; last++) {
    const primary = columns + last;
    if (primary > capPrimary) break;
    if (best !== null && primary > best.primary) break; // 末位升序，之后主键只会更大
    for (const stops of stopVectorsWithLastClean(n, last)) {
      examined++;
      const forbidden = buildForbidden(stops, windowColumns);
      const windows: number[][] = [];
      let ok = true;
      for (let a = 0; a < n; a++) {
        const r = matchCards(allowed[a], forbidden, a, k);
        if (r.failedCard !== -1) {
          ok = false;
          break;
        }
        windows.push(r.windows);
      }
      if (!ok) continue;
      let maxGap = 0;
      for (let i = 1; i < n; i++) maxGap = Math.max(maxGap, stops[i] - stops[i - 1]);
      const plan: Plan = { columns, windowColumns, stops, windows, maxGap, primary };
      const key = secondaryKey(draft, plan);
      if (best === null || bestSecondary === null || lexCompare(key, bestSecondary) < 0) {
        best = plan;
        bestSecondary = key;
      }
    }
  }
  return { plan: best, examined };
}

/** 数值数组字典序比较（不能用 JSON 字符串，否则 "10" < "7"） */
function lexCompare(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** 次级排序键：[最大相邻停点差, 按幕、牌录入顺序的 (停点,窗口列) 序列] */
function secondaryKey(draft: StoryDraft, p: Plan): number[] {
  const seq: number[] = [];
  draft.acts.forEach((act, ai) => {
    for (let ci = 0; ci < act.cards.length; ci++) {
      seq.push(p.stops[ai], p.windowColumns[p.windows[ai][ci]]);
    }
  });
  return [p.maxGap, ...seq];
}

/** 联合搜索：列数 → 窗口列 → 停点 → 每幕窗口匹配，逐级取最优，不做逐幕贪心 */
export function solve(draft: StoryDraft): SolveResult {
  const n = draft.acts.length;
  let best: Plan | null = null;
  let triedScenes = 0;

  for (let columns = MIN_COLUMNS; columns <= MAX_COLUMNS; columns++) {
    // 本轮理论最小主键；比已找到的主键还大就可以整体收工
    if (best !== null && columns + (n - 1) > best.primary) break;
    for (const windowColumns of combinations(range(columns), draft.windowCount)) {
      const result = solveWithColumns(draft, columns, windowColumns,
        best === null ? Infinity : best.primary);
      triedScenes += result.examined;
      const plan = result.plan;
      if (plan === null) continue;
      if (best === null || comparePlan(draft, plan, best) < 0) {
        best = plan;
      }
    }
  }

  if (best) return toSolution(draft, best, triedScenes);
  return buildInfeasibleReport(draft);
}

/** 全局比较：先主键，再次级键 */
function comparePlan(draft: StoryDraft, a: Plan, b: Plan): number {
  if (a.primary !== b.primary) return a.primary - b.primary;
  const ka = secondaryKey(draft, a);
  const kb = secondaryKey(draft, b);
  return lexCompare(ka, kb);
}

function toSolution(draft: StoryDraft, plan: Plan, triedScenes: number): Solution {
  const assignments: CardAssignment[] = [];
  draft.acts.forEach((act, ai) => {
    for (let ci = 0; ci < act.cards.length; ci++) {
      const w = plan.windows[ai][ci];
      assignments.push({
        actIndex: ai,
        cardIndex: ci,
        window: w,
        column: plan.windowColumns[w],
        slot: plan.stops[ai] + plan.windowColumns[w]
      });
    }
  });
  return {
    kind: 'solution',
    columns: plan.columns,
    windowColumns: plan.windowColumns,
    stops: plan.stops,
    assignments,
    maxGap: plan.maxGap,
    triedVectors: triedScenes
  };
}

/* ------------------------------ 无解取证 ------------------------------ */

interface LightScene {
  feasible: boolean;
  /** 受阻幕数 + 受阻牌数，越小越接近成功 */
  badness: number;
  windowColumns: number[];
  stops: number[];
}

/** 轻量评估一个现场：可行性 + 粗糙坏度（热路径，不生成冲突详情） */
function lightEvaluate(
  draft: StoryDraft,
  stops: number[],
  windowColumns: number[]
): LightScene {
  const k = windowColumns.length;
  const forbidden = buildForbidden(stops, windowColumns);
  let badness = 0;
  let feasible = true;
  draft.acts.forEach((act, ai) => {
    const allowed = act.cards.map((card) =>
      [...new Set(card.windows)].sort((a, b) => a - b));
    const r = matchCards(allowed, forbidden, ai, k);
    if (r.failedCard !== -1) {
      feasible = false;
      badness += 100 + (allowed.length - r.failedCard);
    }
  });
  return { feasible, badness, windowColumns, stops };
}

/** 逐牌检查窗口 w 在其他幕停点是否露出，返回全部露出冲突（空 = 干净） */
function revealConflicts(
  cardIndex: number,
  w: number,
  actIndex: number,
  stops: number[],
  windowColumns: number[]
): Conflict[] {
  const windowSet = new Set(windowColumns);
  const slot = stops[actIndex] + windowColumns[w];
  const conflicts: Conflict[] = [];
  for (let b = 0; b < stops.length; b++) {
    if (b === actIndex) continue;
    const offset = slot - stops[b];
    if (windowSet.has(offset)) {
      conflicts.push({
        type: 'reveal',
        cardIndex,
        window: w,
        slot,
        otherStop: stops[b],
        otherAct: b + 1,
        otherColumn: offset
      });
    }
  }
  return conflicts;
}

/** 对单个现场做详细诊断（只对选中的取证现场调用） */
export function diagnoseScene(
  draft: StoryDraft,
  stops: number[],
  windowColumns: number[]
): ActDiagnosis[] {
  return draft.acts.map((_, ai) => diagnoseAct(draft, ai, stops, windowColumns));
}

/** 一幕的详细安置诊断 */
export function diagnoseAct(
  draft: StoryDraft,
  actIndex: number,
  stops: number[],
  windowColumns: number[]
): ActDiagnosis {
  const act = draft.acts[actIndex];
  const perCardOptions: CardPlacement[][] = act.cards.map((card, ci) => {
    const allowed = [...new Set(card.windows)].sort((a, b) => a - b);
    return allowed.map((w) => ({
      window: w,
      slot: stops[actIndex] + windowColumns[w],
      conflicts: revealConflicts(ci, w, actIndex, stops, windowColumns)
    }));
  });

  const k = windowColumns.length;
  const forbidden = buildForbidden(stops, windowColumns);
  const allowed = perCardOptions.map((opts) => opts.map((o) => o.window));
  const quick = matchCards(allowed, forbidden, actIndex, k);
  if (quick.failedCard === -1) {
    return {
      actIndex,
      windows: quick.windows,
      feasible: true,
      perCardConflicts: perCardOptions.map(() => []),
      perCardOptions
    };
  }

  // 不可行：在全部允许窗口组合中找冲突最少的一组（并列取窗口元组字典序小者）
  const enumerate = (choices: number[][]): number[][] => {
    let out: number[][] = [[]];
    for (const options of choices) {
      const next: number[][] = [];
      for (const partial of out) for (const o of options) next.push([...partial, o]);
      out = next;
    }
    return out;
  };

  let bestWindows = perCardOptions.map((opts) => opts[0].window);
  let bestConflicts: Conflict[][] = perCardOptions.map((opts) => [...opts[0].conflicts]);
  let bestBadness = Infinity;
  for (const tuple of enumerate(allowed)) {
    const conflicts: Conflict[][] = perCardOptions.map((opts, ci) =>
      [...opts.find((o) => o.window === tuple[ci])!.conflicts]);
    tuple.forEach((w, ci) => {
      const mates = tuple
        .map((ww, j) => (ww === w && j !== ci ? j : -1))
        .filter((j) => j >= 0);
      if (mates.length > 0) {
        conflicts[ci].push({
          type: 'collision',
          cardIndex: ci,
          window: w,
          slot: stops[actIndex] + windowColumns[w],
          conflictSlot: stops[actIndex] + windowColumns[w],
          conflictingCards: [...new Set([ci + 1, ...mates.map((j) => j + 1)])]
            .sort((a, b) => a - b)
        });
      }
    });
    const badness = conflicts.reduce((n, list) => n + list.length, 0);
    if (badness < bestBadness ||
      (badness === bestBadness && JSON.stringify(tuple) < JSON.stringify(bestWindows))) {
      bestBadness = badness;
      bestWindows = tuple;
      bestConflicts = conflicts;
    }
  }
  return {
    actIndex,
    windows: bestWindows,
    feasible: false,
    perCardConflicts: bestConflicts,
    perCardOptions
  };
}

/**
 * 无解取证：从短到长检查每个幕前缀（放宽到 12 列纸套），
 * 第一个完全无解的前缀即最短不可行前缀；现场取“最接近成功”的一个。
 */
function buildInfeasibleReport(draft: StoryDraft): InfeasibleReport {
  let triedScenes = 0;

  for (let prefix = MIN_ACTS; prefix <= draft.acts.length; prefix++) {
    const subDraft: StoryDraft = {
      windowCount: draft.windowCount,
      acts: draft.acts.slice(0, prefix)
    };

    let witness: LightScene | null = null;
    let anyFeasible = false;
    for (const windowColumns of combinations(range(MAX_COLUMNS), draft.windowCount)) {
      for (const stops of allStopVectorsOrdered(prefix)) {
        triedScenes++;
        const scene = lightEvaluate(subDraft, stops, windowColumns);
        if (scene.feasible) {
          anyFeasible = true;
          continue;
        }
        if (witness === null || scene.badness < witness.badness) {
          witness = scene;
        }
      }
    }

    if (!anyFeasible) {
      const diagnoses = diagnoseScene(subDraft, witness!.stops, witness!.windowColumns);
      const troubles: CardTrouble[] = [];
      diagnoses.forEach((diagnosis) => {
        if (diagnosis.feasible) return;
        subDraft.acts[diagnosis.actIndex].cards.forEach((card, ci) => {
          troubles.push({
            actIndex: diagnosis.actIndex,
            cardIndex: ci,
            allowed: [...new Set(card.windows)].sort((a, b) => a - b),
            conflicts: diagnosis.perCardConflicts[ci] ?? [],
            perCardOptions: diagnosis.perCardOptions[ci]
          });
        });
      });
      return {
        kind: 'infeasible',
        prefixLength: prefix,
        windowColumns: witness!.windowColumns,
        stops: witness!.stops,
        troubles,
        collisionOnly: troubles.length > 0 &&
          troubles.every((t) => t.conflicts.length > 0 &&
            t.conflicts.every((c) => c.type === 'collision')),
        triedVectors: triedScenes
      };
    }
  }
  throw new Error('内部错误：无法生成无解取证。');
}
