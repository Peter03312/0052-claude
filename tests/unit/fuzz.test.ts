import { describe, expect, it } from 'vitest';
import { solve } from '../../src/lib/solver';
import type { StoryDraft } from '../../src/lib/types';
import { bruteForceAll, lexCompare, makeDraft, planKey, verifyPlan } from './helpers';

/** 确定性伪随机，保证测试可复现、不依赖随机种子环境 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 与独立暴力参照做大规模一致性对拍（两幕规模，列数限 8 列以内，保证暴力可承受）。
 * 对每个随机草稿核对：
 *  - 参照无解 ⇒ 求解器必判无解；
 *  - 参照有解 ⇒ 求解器结果通过逐条硬约束校验，且排序键恰为参照全局最优。
 */
describe('求解器 ⇄ 独立暴力参照：随机对拍', () => {
  it('80 个随机两幕草稿：可行性与最优排序完全一致', () => {
    const rand = mulberry32(20260914);
    for (let iter = 0; iter < 80; iter++) {
      const k = 1 + Math.floor(rand() * 3);
      const cardsPerAct = [1 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 3)];
      const acts = cardsPerAct.map((m) =>
        Array.from({ length: m }, () => {
          const allow: number[] = [];
          for (let w = 0; w < k; w++) if (rand() < 0.7) allow.push(w);
          if (allow.length === 0) allow.push(Math.floor(rand() * k));
          return allow;
        })
      );
      const draft = makeDraft(k, acts);
      const result = solve(draft);
      const plans = bruteForceAll(draft, 8);

      if (plans.length === 0) {
        // 暴力只在 ≤8 列搜索；求解器允许到 12 列，若 8 列无解需再用全量暴力确认
        const allPlans = bruteForceAll(draft, 12);
        if (allPlans.length === 0) {
          expect(result.kind).toBe('infeasible');
        } else {
          expect(result.kind).toBe('solution');
        }
      } else {
        expect(result.kind).toBe('solution');
        if (result.kind !== 'solution') continue;
        const flat: number[][] = [];
        let i = 0;
        for (const act of draft.acts) {
          flat.push(result.assignments.slice(i, i + act.cards.length).map((a) => a.window));
          i += act.cards.length;
        }
        const solverPlan = {
          columns: result.columns,
          windowColumns: result.windowColumns,
          stops: result.stops,
          windows: flat
        };
        expect(verifyPlan(draft, solverPlan)).toBe(true);

        // 若求解器选在 9~12 列，参照需扩到 12 列再比最优
        const allPlans = result.columns > 8 ? bruteForceAll(draft, 12) : plans;
        const refBest = allPlans.reduce(
          (b, p) => (lexCompare(planKey(draft, p), planKey(draft, b)) < 0 ? p : b),
          allPlans[0]
        );
        expect(result.columns).toBe(refBest.columns);
        expect(result.windowColumns).toEqual(refBest.windowColumns);
        expect(result.stops).toEqual(refBest.stops);
        expect(flat).toEqual(refBest.windows);
      }
    }
  });

  it('无解取证报告自洽：最短前缀单独验证为无解，更短前缀都有解', () => {
    const rand = mulberry32(424242);
    let checked = 0;
    for (let iter = 0; iter < 60 && checked < 5; iter++) {
      const k = 1 + Math.floor(rand() * 2);
      const acts = Array.from({ length: 3 + Math.floor(rand() * 2) }, () =>
        Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
          const allow: number[] = [];
          for (let w = 0; w < k; w++) if (rand() < 0.45) allow.push(w);
          if (allow.length === 0) allow.push(0);
          return allow;
        })
      );
      const draft = makeDraft(k, acts);
      const result = solve(draft);
      if (result.kind !== 'infeasible') continue;
      checked++;
      // 最短前缀本身无解（全量 12 列暴力确认）
      const prefix: StoryDraft = {
        windowCount: draft.windowCount,
        acts: draft.acts.slice(0, result.prefixLength)
      };
      expect(bruteForceAll(prefix, 12).length).toBe(0);
      // 更短前缀（至少 2 幕）必有解
      if (result.prefixLength > 2) {
        const shorter: StoryDraft = {
          windowCount: draft.windowCount,
          acts: draft.acts.slice(0, result.prefixLength - 1)
        };
        expect(bruteForceAll(shorter, 12).length).toBeGreaterThan(0);
      }
      // 取证字段齐全：窗口、停点、槽位都是合法整数
      for (const t of result.troubles) {
        expect(t.conflicts.length).toBeGreaterThan(0);
        for (const c of t.conflicts) {
          expect(Number.isInteger(c.slot)).toBe(true);
          expect(Number.isInteger(c.window)).toBe(true);
          if (c.type === 'reveal') {
            expect(Number.isInteger(c.otherStop!)).toBe(true);
            expect(Number.isInteger(c.otherColumn!)).toBe(true);
          }
        }
      }
      // 取证现场的停点合法
      expect(result.stops[0]).toBe(0);
      for (let i = 1; i < result.stops.length; i++) {
        expect(result.stops[i]).toBeGreaterThan(result.stops[i - 1]);
      }
      expect(new Set(result.windowColumns).size).toBe(result.windowColumns.length);
    }
    expect(checked).toBeGreaterThan(0); // 种子下必须确实抽到过无解案例
  });
});
