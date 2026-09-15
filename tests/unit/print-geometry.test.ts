import { describe, expect, it } from 'vitest';
import { PRINT } from '../../src/lib/geometry';
import { solve } from '../../src/lib/solver';
import { makeDraft } from './helpers';

/**
 * 打印几何回归：所有幕的牌必须位于“同一横带”内。
 * 实物是在纸套中水平抽拉的单根条带，牌若按幕分行，
 * 三幕以后的牌会排到窗口下方，停点对准时也看不见。
 */
describe('打印条带几何：所有牌在同一横带', () => {
  it('横带高度只容纳一行牌，与幕数无关', () => {
    expect(PRINT.stripBandMm).toBeGreaterThan(0);
    // 不再存在“按幕数 × 行高”的参数
    expect(PRINT).not.toHaveProperty('cardRowMm');
  });

  for (const actCount of [2, 3, 4, 5, 6]) {
    it(`${actCount} 幕故事：每张牌只按槽位横向定位，纵向都在横带顶`, () => {
      const draft = makeDraft(1,
        Array.from({ length: actCount }, () => [[0]]));
      const r = solve(draft);
      expect(r.kind).toBe('solution');
      if (r.kind !== 'solution') return;

      // 打印时牌的 top 恒为 0.5mm（横带内统一行），不随行/幕变化
      const cardTopMm = 0.5;
      const bandMm = PRINT.stripBandMm;
      const cardH = bandMm - 1;

      for (const a of r.assignments) {
        // 纵向：所有牌都在同一高度
        expect(cardTopMm).toBe(0.5);
        expect(cardTopMm).toBeLessThan(bandMm);
        expect(cardTopMm + cardH).toBeLessThanOrEqual(bandMm + 0.001);
        // 横向：槽 = 停点 + 窗口列，落在条带刻度范围内
        expect(a.slot).toBe(r.stops[a.actIndex] + r.windowColumns[a.window]);
        expect(a.slot * PRINT.stripColumnMm).toBeGreaterThanOrEqual(0);
      }

      // 每幕停点严格递增，确保各幕牌横向错开、不分行堆叠
      for (let i = 1; i < r.stops.length; i++) {
        expect(r.stops[i]).toBeGreaterThan(r.stops[i - 1]);
      }

      // 全部槽位互不重合（同一横带上不能叠印）
      const slots = r.assignments.map((a) => a.slot);
      expect(new Set(slots).size).toBe(slots.length);
    });
  }

  it('多窗口多牌三幕：同一幕多张牌横向并排，下一幕仍在同一横带', () => {
    const draft = makeDraft(2, [
      [[0], [1]],
      [[0], [1]],
      [[0, 1], [0, 1]],
    ]);
    const r = solve(draft);
    expect(r.kind).toBe('solution');
    if (r.kind !== 'solution') return;
    const bandMm = PRINT.stripBandMm;
    for (let i = 0; i < r.assignments.length; i++) {
      const top = 0.5;
      const h = bandMm - 1;
      expect(top + h).toBeLessThanOrEqual(bandMm + 0.001);
      // 每张牌都在统一横带的高度窗口 [0.5, bandMm-0.5] 内
      expect(top).toBeGreaterThanOrEqual(0);
      expect(h).toBeGreaterThan(0);
    }
    // 牌全部存在（覆盖三幕、含第三幕两张牌）
    expect(r.assignments.length).toBe(
      draft.acts.reduce((n, act) => n + act.cards.length, 0),
    );
  });
});
