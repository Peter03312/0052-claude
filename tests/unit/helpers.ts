import type { SolveResult, StoryDraft } from '../../src/lib/types';
import { combinations } from '../../src/lib/solver';

/** 独立暴力参照：穷举 列数/窗口列/停点/每牌窗口，逐条核对题面硬约束 */
export interface BrutePlan {
  columns: number;
  windowColumns: number[];
  stops: number[];
  windows: number[][]; // [幕][牌] -> 窗口编号
}

export function bruteForceAll(draft: StoryDraft, maxColumns = 12): BrutePlan[] {
  const n = draft.acts.length;
  const k = draft.windowCount;
  const feasible: BrutePlan[] = [];

  const stopPool = Array.from({ length: 12 }, (_, i) => i + 1);
  const stopVectors = combinations(stopPool, n - 1).map((rest) => [0, ...rest]);

  const enumerate = (choices: number[][]): number[][] => {
    let out: number[][] = [[]];
    for (const options of choices) {
      const next: number[][] = [];
      for (const partial of out) for (const o of options) next.push([...partial, o]);
      out = next;
    }
    return out;
  };

  for (let columns = 6; columns <= maxColumns; columns++) {
    for (const windowColumns of combinations(
      Array.from({ length: columns }, (_, c) => c), k)) {
      for (const stops of stopVectors) {
        const choices = draft.acts.map((act) =>
          act.cards.map((card) => [...new Set(card.windows)].sort((a, b) => a - b)));
        // 每幕枚举窗口组合
        const perAct = choices.map((c) => enumerate(c));
        const combine = (idx: number, acc: number[][]): void => {
          if (idx === n) {
            if (verifyPlan(draft, { columns, windowColumns, stops, windows: acc })) {
              feasible.push({ columns, windowColumns, stops, windows: acc });
            }
            return;
          }
          for (const tuple of perAct[idx]) combine(idx + 1, [...acc, tuple]);
        };
        combine(0, []);
      }
    }
  }
  return feasible;
}

/** 逐字核对题面硬约束：露出台词、两句共用槽位、允许窗口 */
export function verifyPlan(draft: StoryDraft, plan: BrutePlan): boolean {
  const { stops, windowColumns, windows } = plan;
  const windowSet = new Set(windowColumns);
  const slotsAll: { act: number; card: number; slot: number }[] = [];

  for (let ai = 0; ai < draft.acts.length; ai++) {
    const seenWindows = new Set<number>();
    for (let ci = 0; ci < draft.acts[ai].cards.length; ci++) {
      const w = windows[ai][ci];
      // 必须是允许窗口
      if (!draft.acts[ai].cards[ci].windows.includes(w)) return false;
      // 同幕窗口互异（否则槽位重合）
      if (seenWindows.has(w)) return false;
      seenWindows.add(w);
      const slot = stops[ai] + windowColumns[w];
      slotsAll.push({ act: ai, card: ci, slot });
    }
  }

  // 全局槽位不重合
  const slotSet = new Set<number>();
  for (const s of slotsAll) {
    if (slotSet.has(s.slot)) return false;
    slotSet.add(s.slot);
  }

  // 任一停点：只有当前幕牌可落在窗口；其他幕牌不得落入任一窗口
  for (let q = 0; q < stops.length; q++) {
    for (const s of slotsAll) {
      if (s.act === q) continue;
      if (windowSet.has(s.slot - stops[q])) return false;
    }
  }
  return true;
}

/** 数值数组字典序比较（不能用 JSON 字符串，否则 "10" < "7"） */
export function lexCompare(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** 题面排序键：[列数+最后停点, 最大相邻差, ...按幕牌录入顺序的(停点,窗口列)序列] */
export function planKey(draft: StoryDraft, p: BrutePlan): number[] {
  let maxGap = 0;
  for (let i = 1; i < p.stops.length; i++) maxGap = Math.max(maxGap, p.stops[i] - p.stops[i - 1]);
  const seq: number[] = [];
  draft.acts.forEach((act, ai) => {
    act.cards.forEach((_, ci) => seq.push(p.stops[ai], p.windowColumns[p.windows[ai][ci]]));
  });
  return [p.columns + p.stops[p.stops.length - 1], maxGap, ...seq];
}

export function bruteOptimal(draft: StoryDraft): BrutePlan | null {
  const all = bruteForceAll(draft);
  if (all.length === 0) return null;
  return all.reduce((best, p) => (lexCompare(planKey(draft, p), planKey(draft, best)) < 0 ? p : best), all[0]);
}

/** 断言求解结果是真正的全局最优 */
export function expectOptimal(result: SolveResult, draft: StoryDraft): void {
  expect(result.kind).toBe('solution');
  if (result.kind !== 'solution') return;
  const optimal = bruteOptimal(draft);
  expect(optimal).not.toBeNull();
  expect(result.columns).toBe(optimal!.columns);
  expect(result.windowColumns).toEqual(optimal!.windowColumns);
  expect(result.stops).toEqual(optimal!.stops);
  const flatWindows = result.assignments.map((a) => a.window);
  const flatOptimal = optimal!.windows.flat();
  expect(flatWindows).toEqual(flatOptimal);
}

/** 构造草稿的便捷函数 */
export function makeDraft(
  windowCount: number,
  acts: number[][][],
  texts?: string[]
): StoryDraft {
  let t = 0;
  return {
    windowCount,
    acts: acts.map((cards) => ({
      cards: cards.map((w) => ({
        text: texts ? texts[t++] : `牌${t++}`,
        windows: [...w]
      }))
    }))
  };
}
