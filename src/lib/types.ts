/**
 * 领域模型：
 * - 故事分成 2~6「幕」，每幕有 1~3 张写着短句的「牌」。
 * - 纸套（外壳）上挖出 1~3 个单格「窗口」，窗口从 0 开始编号，
 *   分别固定在纸套的某一列上（列号互异，范围 0…列数-1）。
 * - 牌固定在一根长「条带」上，条带在纸套里抽拉。
 * - 每拉到一个「停点」，当前幕所有牌的印刷槽 s = 停点 + 窗口列，
 *   要正好对准窗口；其他幕的牌不得出现在窗口里；任何两张牌的槽位都不能重合。
 */

/** 一张牌：短句 + 允许使用的窗口编号（0…窗口数-1） */
export interface CardInput {
  text: string;
  /** 允许窗口编号集合，必须非空，且不超过总窗口数 */
  windows: number[];
}

/** 一幕：若干张牌 */
export interface ActInput {
  cards: CardInput[];
}

/** 孩子录入的整个故事草稿 */
export interface StoryDraft {
  /** 窗口数（纸套上挖几个单格窗口），1~3 */
  windowCount: number;
  acts: ActInput[];
}

/** 一张牌的分配结果 */
export interface CardAssignment {
  /** 录入顺序：第 actIndex 幕、第 cardIndex 张 */
  actIndex: number;
  cardIndex: number;
  /** 选中的窗口编号 */
  window: number;
  /** 该窗口在纸套上的列号 */
  column: number;
  /** 印刷槽位 = 本幕停点 + 窗口列 */
  slot: number;
}

/** 完整校样（有解时） */
export interface Solution {
  kind: 'solution';
  /** 纸套列数 L（6~12，从零编号到 L-1） */
  columns: number;
  /** 窗口编号 → 窗口列号 */
  windowColumns: number[];
  /** 每幕停点：第 0 幕恒为 0，其余严格递增且在 1…12 */
  stops: number[];
  /** 按幕、牌录入顺序排列的分配结果 */
  assignments: CardAssignment[];
  /** 优化目标辅助值：最大相邻停点差 */
  maxGap: number;
  /** 搜索中评估过的（窗口列 × 停点）摆法条数（向孩子说明“认真找过”） */
  triedVectors: number;
}

/** 一张牌在某个窗口上的安置尝试 */
export interface CardPlacement {
  /** 尝试的窗口编号 */
  window: number;
  /** 对应的印刷槽位 */
  slot: number;
  /** 该尝试引发的冲突（空 = 这个窗口干净） */
  conflicts: Conflict[];
}

/** 某一幕在固定（窗口列、停点）现场下的安置诊断 */
export interface ActDiagnosis {
  actIndex: number;
  /** 建议窗口编号（可行时为字典序最小合法解） */
  windows: number[];
  /** 这一幕是否能干净落位 */
  feasible: boolean;
  /** 每张牌在建议窗口下的冲突 */
  perCardConflicts: Conflict[][];
  /** 每张牌逐个允许窗口的完整尝试（给界面联动高亮用） */
  perCardOptions: CardPlacement[][];
}

/** 冲突的具体证据 */
export interface Conflict {
  type: 'reveal' | 'collision';
  /** 惹麻烦的牌（第 p 幕内） */
  cardIndex: number;
  /** 尝试使用的窗口编号 */
  window: number;
  /** 这张牌会落到的印刷槽 */
  slot: number;
  /** 与谁冲突：另一幕的停点（提前露出/后面露出） */
  otherStop?: number;
  /** 与谁冲突：另一幕的序号（从 1 起，面向孩子） */
  otherAct?: number;
  /** 与谁冲突：窗口列号（提前露出/后面露出） */
  otherColumn?: number;
  /** collision 时：同一组里互相挤占同槽的牌序号（从 1 起，面向孩子） */
  conflictingCards?: number[];
  /** 同槽冲突时的槽位说明 */
  conflictSlot?: number;
}

/** 某张牌在固定现场下走投无路的说明 */
export interface CardTrouble {
  /** 所在幕（从 0 起） */
  actIndex: number;
  cardIndex: number;
  /** 允许的窗口编号 */
  allowed: number[];
  /** 建议窗口下的冲突；perCardOptions 另有全部尝试 */
  conflicts: Conflict[];
  perCardOptions?: CardPlacement[];
}

/** 无解时的取证结果 */
export interface InfeasibleReport {
  kind: 'infeasible';
  /** 最短不可行幕前缀长度（从 1 起；即前 prefixLength 幕无法同时满足） */
  prefixLength: number;
  /** 取证用窗口列（按列号升序） */
  windowColumns: number[];
  /** 取证用停点（第 0 个恒为 0） */
  stops: number[];
  /** 第 prefixLength 幕（最后一幕）里每张牌的困境 */
  troubles: CardTrouble[];
  /** 该前缀的所有牌都分别能落入窗口，但彼此槽位撞车（理论上被 reveal 覆盖，留作兜底） */
  collisionOnly: boolean;
  /** 12 列纸套下尝试过的停点向量条数 */
  triedVectors: number;
}

export type SolveResult = Solution | InfeasibleReport;

/** 孩子可读的校验错误（适龄、温和） */
export interface DraftError {
  field: string;
  message: string;
}
