/** SVG 与打印页共用的纸面几何（单位：毫米思路，屏幕上按像素等比放大） */

export const SLOT_W = 42; // 每列宽（px）
export const SLEEVE_H = 64; // 纸套窗口带高度
export const ACT_ROW_H = 30; // 条带上每幕牌的行高
export const RULER_H = 26; // 列号尺子高度
export const MARGIN_X = 28;
export const MARGIN_Y = 24;

/** 条带需要画到的最大列号（停点最大 12，窗口列最大 11） */
export function maxSlotIndex(stops: number[], windowColumns: number[]): number {
  let m = 0;
  for (const s of stops) for (const c of windowColumns) m = Math.max(m, s + c);
  return m;
}

export function slotX(slot: number): number {
  return MARGIN_X + slot * SLOT_W + SLOT_W / 2;
}

export function columnLabelX(column: number): number {
  return MARGIN_X + column * SLOT_W + SLOT_W / 2;
}

/** 打印毫米尺寸（A4 横向留白后可用宽度约 277mm） */
export const PRINT = {
  sleeveColumnMm: 22,
  sleeveHeightMm: 34,
  stripColumnMm: 22,
  /** 条带是穿进纸套的单一横带，高度与窗口格一致；所有幕的牌都在这一行上 */
  stripBandMm: 22,
  glueFlapMm: 16,
  cutTickMm: 5
};

export function printSleeveWidthMm(columns: number): number {
  return columns * PRINT.sleeveColumnMm;
}

export function printStripWidthMm(maxSlot: number): number {
  return (maxSlot + 1) * PRINT.stripColumnMm;
}
