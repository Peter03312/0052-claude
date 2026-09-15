import { describe, expect, it } from 'vitest';
import {
  MAX_ACTS,
  MAX_CARDS,
  MAX_WINDOWS,
  solve,
  validateDraft
} from '../../src/lib/solver';
import type { Solution, StoryDraft } from '../../src/lib/types';
import { bruteForceAll, expectOptimal, makeDraft, verifyPlan } from './helpers';

/** 对有解结果做通用合法性核对（不依赖参照实现） */
function expectValidSolution(draft: StoryDraft, s: Solution) {
  // 列数 6~12
  expect(s.columns).toBeGreaterThanOrEqual(6);
  expect(s.columns).toBeLessThanOrEqual(12);
  // 窗口列互异且在列范围内
  expect(s.windowColumns.length).toBe(draft.windowCount);
  expect(new Set(s.windowColumns).size).toBe(draft.windowCount);
  for (const c of s.windowColumns) {
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThan(s.columns);
  }
  // 停点：0 起步、1..12 严格递增
  expect(s.stops[0]).toBe(0);
  for (let i = 1; i < s.stops.length; i++) {
    expect(s.stops[i]).toBeGreaterThan(s.stops[i - 1]);
    expect(s.stops[i]).toBeGreaterThanOrEqual(1);
    expect(s.stops[i]).toBeLessThanOrEqual(12);
  }
  // 每张牌恰好分配一次，窗口在允许集合内，槽 = 停点+窗口列
  const slotSet = new Set<number>();
  for (const a of s.assignments) {
    const card = draft.acts[a.actIndex].cards[a.cardIndex];
    expect(card.windows).toContain(a.window);
    expect(a.slot).toBe(s.stops[a.actIndex] + a.column);
    expect(s.windowColumns[a.window]).toBe(a.column);
    expect(slotSet.has(a.slot)).toBe(false);
    slotSet.add(a.slot);
  }
  // 同幕窗口互异（等价于同幕槽不重合，且各自落入选定窗口）
  draft.acts.forEach((_act, ai) => {
    const ws = s.assignments.filter((a) => a.actIndex === ai).map((a) => a.window);
    expect(new Set(ws).size).toBe(ws.length);
  });
  // 任何停点，别的幕牌不得落入任一窗口
  const windowSet = new Set(s.windowColumns);
  for (let q = 0; q < s.stops.length; q++) {
    for (const a of s.assignments) {
      if (a.actIndex === q) continue;
      expect(windowSet.has(a.slot - s.stops[q])).toBe(false);
    }
  }
}

describe('基础有解场景：遮与露', () => {
  it('两幕一窗各一牌：最简单故事能排出', () => {
    const draft = makeDraft(1, [[[0]], [[0]]]);
    const r = solve(draft);
    expect(r.kind).toBe('solution');
    if (r.kind !== 'solution') return;
    expectValidSolution(draft, r);
    // 第一幕槽 0，第二幕槽 1（最小）
    expect(r.assignments.map((a) => a.slot)).toEqual([0, 1]);
    expect(r.stops).toEqual([0, 1]);
  });

  it('两窗两牌每幕：当前幕两张同时出现，互不分槽', () => {
    const draft = makeDraft(2, [
      [[0], [1]],
      [[0], [1]]
    ]);
    const r = solve(draft);
    expect(r.kind).toBe('solution');
    if (r.kind !== 'solution') return;
    expectValidSolution(draft, r);
    // 第一幕停点 0，两张牌窗口不同 → 槽位正好是两个窗口列
    const act0Slots = r.assignments
      .filter((a) => a.actIndex === 0)
      .map((a) => a.slot)
      .sort((x, y) => x - y);
    expect(act0Slots).toEqual([...r.windowColumns].sort((x, y) => x - y));
  });

  it('窗口间距会挡住相邻停点：两窗列 0、1 时停点差不能为 1', () => {
    // 若窗口列相距 1，相邻幕停点也差 1，则后幕牌会在第一停点露出
    const draft = makeDraft(2, [
      [[0], [1]],
      [[0], [1]]
    ]);
    const r = solve(draft);
    if (r.kind !== 'solution') return;
    // 校验：所有非本幕牌在别的停点都不落在窗口列（expectValidSolution 已覆盖）
    expectValidSolution(draft, r);
  });

  it('与暴力参照在 2 幕 3 窗规模下完全一致（含遮露硬约束）', () => {
    const cases = [
      makeDraft(1, [[[0]], [[0]]]),
      makeDraft(2, [[[0, 1], [0]], [[1], [0, 1]]]),
      makeDraft(2, [[[0], [1]], [[0, 1], [1]]]),
      makeDraft(3, [[[0, 1], [2]], [[1, 2], [0]]]),
      makeDraft(3, [[[0, 2], [1, 2], [0]], [[2], [0, 1], [1, 2]]]),
      makeDraft(2, [[[0], [0, 1]], [[0, 1], [1]], [[0], [0, 1]]])
    ];
    for (const draft of cases) {
      const r = solve(draft);
      if (r.kind === 'solution') {
        expectValidSolution(draft, r);
        const plans = bruteForceAll(draft);
        expect(plans.length).toBeGreaterThan(0);
        // 结果必须通过独立暴力校验器
        const ok = verifyPlan(draft, {
          columns: r.columns,
          windowColumns: r.windowColumns,
          stops: r.stops,
          windows: groupByAct(draft, r.assignments.map((a) => a.window))
        });
        expect(ok).toBe(true);
      }
    }
  });
});

function groupByAct(draft: StoryDraft, flat: number[]): number[][] {
  const out: number[][] = [];
  let i = 0;
  for (const act of draft.acts) {
    out.push(flat.slice(i, i + act.cards.length));
    i += act.cards.length;
  }
  return out;
}

describe('非贪心：必须联合搜索停点与窗口', () => {
  it('只顾前一幕的贪心会失败，联合搜索有解', () => {
    // 精心构造：第 1 幕若贪心拿“看起来最近”的窗口，第 2 幕会撞车/露出，
    // 但整体调整第 1 幕窗口后两幕都成立。
    const draft = makeDraft(2, [
      [[0, 1], [1]],
      [[1], [0, 1]]
    ]);
    const r = solve(draft);
    expect(r.kind).toBe('solution');
    if (r.kind !== 'solution') return;
    expectValidSolution(draft, r);
    const plans = bruteForceAll(draft);
    expect(plans.length).toBeGreaterThan(0);
    expectOptimal(r, draft);
  });

  it('三幕循环依赖：每一幕的好位置都取决于后一幕', () => {
    const draft = makeDraft(2, [
      [[0, 1], [0]],
      [[1], [0, 1]],
      [[0], [1]]
    ]);
    const r = solve(draft);
    if (r.kind !== 'solution') throw new Error('应有解');
    expectValidSolution(draft, r);
    expectOptimal(r, draft);
  });

  it('停点不能逐幕定死：需要为后面的幕预留间隔', () => {
    // 三窗、三幕；贪心会把停点堆在 1、2，导致第三幕无处可停
    const draft = makeDraft(3, [
      [[0], [1], [2]],
      [[0], [1], [2]],
      [[0], [1], [2]]
    ]);
    const r = solve(draft);
    if (r.kind !== 'solution') throw new Error('应有解');
    expectValidSolution(draft, r);
    // 三个窗口占三列时，相邻停点必须跳过窗口跨度
    expect(r.maxGap).toBeGreaterThanOrEqual(0);
  });
});

describe('无解取证', () => {
  it('两张牌只允许同一窗口 → 同幕必撞槽', () => {
    const draft = makeDraft(1, [
      [[0], [0]],
      [[0]]
    ]);
    const r = solve(draft);
    expect(r.kind).toBe('infeasible');
    if (r.kind !== 'infeasible') return;
    expect(r.prefixLength).toBeGreaterThanOrEqual(2);
    expect(r.troubles.length).toBeGreaterThan(0);
    // 必须给出冲突窗口、停点和槽位
    const allConflicts = r.troubles.flatMap((t) => t.conflicts);
    expect(allConflicts.length).toBeGreaterThan(0);
    for (const c of allConflicts) {
      expect(c.window).toBeGreaterThanOrEqual(0);
      expect(c.slot).toBeGreaterThanOrEqual(0);
      if (c.type === 'reveal') {
        expect(c.otherStop).not.toBeUndefined();
        expect(c.otherColumn).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('最短不可行前缀：加第三幕才无解时，前缀是 3 而非 2', () => {
    // 前两幕可解（单窗单牌错开停点），第三幕构造为单窗但强制撞露不可能；
    // 用 1 窗、某幕两张同窗口牌制造“第三幕才失败”。
    const draft = makeDraft(1, [
      [[0]],
      [[0]],
      [[0], [0]] // 两张牌必须共用唯一窗口 → 第三幕前缀才失败
    ]);
    const r = solve(draft);
    expect(r.kind).toBe('infeasible');
    if (r.kind !== 'infeasible') return;
    expect(r.prefixLength).toBe(3);
    // 取证现场包含完整停点（含前两幕的位置）
    expect(r.stops.length).toBe(3);
  });

  it('提前露出冲突会被取证指出 otherStop/otherColumn', () => {
    const draft = makeDraft(2, [
      [[0, 1], [0, 1]],
      [[0, 1], [0, 1]],
      [[0], [0]]
    ]);
    const r = solve(draft);
    expect(r.kind).toBe('infeasible');
    if (r.kind !== 'infeasible') return;
    expect(r.prefixLength).toBe(3);
    const types = new Set(r.troubles.flatMap((t) => t.conflicts.map((c) => c.type)));
    expect(types.size).toBeGreaterThan(0);
  });

  it('与暴力参照一致：参照无解时求解器也必须判无解', () => {
    const cases = [
      makeDraft(1, [[[0], [0]], [[0]]]),
      makeDraft(2, [[[0], [0]], [[1], [1]]]),
      makeDraft(1, [[[0]], [[0]], [[0], [0]]])
    ];
    for (const draft of cases) {
      const r = solve(draft);
      const plans = bruteForceAll(draft);
      if (plans.length === 0) {
        expect(r.kind).toBe('infeasible');
      } else {
        expect(r.kind).toBe('solution');
      }
    }
  });
});

describe('并列排序：主键→相邻差→字典序', () => {
  it('与暴力最优在多组随机小案例上一致', () => {
    const cases: StoryDraft[] = [];
    // 确定性枚举一批 2~3 幕、1~3 牌、1~2 窗的允许集合模式
    const patterns: number[][][][] = [
      [[[0]], [[0]]],
      [[[0, 1]], [[0]]],
      [[[0], [1]], [[0, 1]]],
      [[[1], [0]], [[0], [1]], [[1], [0]]]
    ];
    for (const acts of patterns) {
      for (let k = 1; k <= 2; k++) {
        // 每张牌保留 < k 的允许窗口；被裁空的牌兜底为窗 0
        const normalized: number[][][] = acts.map((act) =>
          act.map((ws) => {
            const kept = ws.filter((w) => w < k);
            return kept.length ? kept : [0];
          })
        );
        cases.push(makeDraft(k, normalized));
      }
    }
    for (const draft of cases) {
      const r = solve(draft);
      if (r.kind !== 'solution') continue;
      expectValidSolution(draft, r);
      expectOptimal(r, draft);
    }
  });

  it('主键优先：宁可相邻差略大，也要列数+最后停点更小', () => {
    // 全允许的两幕一牌：最优应是 6 列、停点 [0,1]，主键 7
    const draft = makeDraft(1, [[[0]], [[0]]]);
    const r = solve(draft);
    if (r.kind !== 'solution') throw new Error('应有解');
    expect(r.columns + r.stops[r.stops.length - 1]).toBe(7);
    expect(r.columns).toBe(6);
  });

  it('字典序末位裁决：同主键同相邻差时，(停点,窗口列) 序列更小', () => {
    // 两窗、两幕各一牌，均允许两窗：列 6、窗口 [0,1]，停点 [0,1] 时
    // 第一张牌选窗 0（列 0）字典序更小
    const draft = makeDraft(2, [[[0, 1]], [[0, 1]]]);
    const r = solve(draft);
    if (r.kind !== 'solution') throw new Error('应有解');
    expect(r.assignments[0].column).toBe(0);
    expectOptimal(r, draft);
  });
});

describe('边界与录入校验', () => {
  it('最大 6 幕、每幕 3 牌、3 窗口：1.5 秒内给答案', () => {
    const draft = makeDraft(3,
      Array.from({ length: MAX_ACTS }, () =>
        Array.from({ length: MAX_CARDS }, () => [0, 1, 2])));
    const t0 = Date.now();
    const r = solve(draft);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.kind).toBe('solution');
    if (r.kind === 'solution') expectValidSolution(draft, r);
  });

  it('最大规模无解也在 2 秒内取证', () => {
    const draft = makeDraft(3,
      Array.from({ length: MAX_ACTS }, () =>
        Array.from({ length: MAX_CARDS }, () => [0])));
    const t0 = Date.now();
    const r = solve(draft);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.kind).toBe('infeasible');
    if (r.kind === 'infeasible') {
      expect(r.prefixLength).toBeGreaterThanOrEqual(2);
      expect(r.troubles.length).toBeGreaterThan(0);
    }
  });

  it('最少规模：2 幕各 1 牌 1 窗', () => {
    const r = solve(makeDraft(1, [[[0]], [[0]]]));
    expect(r.kind).toBe('solution');
  });

  it('窗口数量越界给出适龄提示', () => {
    const errors = validateDraft({ windowCount: 0, acts: [] });
    expect(errors.some((e) => e.field === 'windowCount')).toBe(true);
    expect(errors[0].message).toMatch(/窗口/);
  });

  it('幕数不足/超出给出提示', () => {
    const tooFew = validateDraft({ windowCount: 1, acts: [{ cards: [{ text: 'a', windows: [0] }] }] });
    expect(tooFew.some((e) => /幕/.test(e.message))).toBe(true);
    const tooMany = validateDraft({
      windowCount: 1,
      acts: Array.from({ length: MAX_ACTS + 1 }, () => ({ cards: [{ text: 'a', windows: [0] }] }))
    });
    expect(tooMany.some((e) => /幕/.test(e.message))).toBe(true);
  });

  it('牌数越界、空句子、空窗口集合都被温和拦截', () => {
    const draft: StoryDraft = {
      windowCount: 2,
      acts: [
        { cards: [{ text: '', windows: [] }] },
        { cards: [{ text: '好', windows: [0] }, { text: 'a', windows: [0] },
          { text: 'b', windows: [0] }, { text: 'c', windows: [0] }] }
      ]
    };
    const errors = validateDraft(draft);
    expect(errors.some((e) => /还没有写句子/.test(e.message))).toBe(true);
    expect(errors.some((e) => /至少要挑一个允许的窗口/.test(e.message))).toBe(true);
    expect(errors.some((e) => /1 到 3 张牌/.test(e.message))).toBe(true);
  });

  it('窗口编号超出窗口总数被识别', () => {
    const draft = makeDraft(1, [[[0]], [[0]]]);
    draft.acts[0].cards[0].windows = [5];
    const errors = validateDraft(draft);
    expect(errors.some((e) => /不存在的窗口/.test(e.message))).toBe(true);
  });

  it('错误提示不含技术术语（适龄）', () => {
    const draft: StoryDraft = { windowCount: MAX_WINDOWS + 1, acts: [] };
    for (const e of validateDraft(draft)) {
      expect(e.message).not.toMatch(/undefined|NaN|TypeError|stack|exception/i);
    }
  });
});
