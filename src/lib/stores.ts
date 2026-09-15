import { writable, get } from 'svelte/store';
import type { DraftError, InfeasibleReport, Solution, StoryDraft } from './types';

const STORAGE_KEY = 'pull-story-cards:draft:v1';

/** 新故事的起始草稿：2 幕，每幕 1 张牌，1 个窗口 */
export function emptyDraft(): StoryDraft {
  return {
    windowCount: 1,
    acts: [
      { cards: [{ text: '', windows: [0] }] },
      { cards: [{ text: '', windows: [0] }] }
    ]
  };
}

/** 读回本地草稿；坏数据一律安静忽略（不弹吓人的错误） */
function loadDraft(): { draft: StoryDraft; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft?: StoryDraft; savedAt?: number };
    if (!parsed.draft || !Array.isArray(parsed.draft.acts)) return null;
    return { draft: parsed.draft, savedAt: parsed.savedAt ?? 0 };
  } catch {
    return null;
  }
}

function persist(draft: StoryDraft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ draft, savedAt: Date.now() }));
  } catch {
    // 存储空间满了或被浏览器关掉时，悄悄失败也不影响纸上工作
  }
}

export type Proof = Solution | InfeasibleReport;

// 先创建全部 store，避免工厂函数执行时引用未初始化变量（TDZ）
const initial = loadDraft();

const proofWritable = writable<Proof | null>(null);
const errorWritable = writable<DraftError[]>([]);
const draftWritable = writable<StoryDraft>(initial?.draft ?? emptyDraft());

export const proofStore = {
  subscribe: proofWritable.subscribe,
  set(proof: Proof) {
    proofWritable.set(proof);
  },
  clear() {
    proofWritable.set(null);
  }
};

export const errorStore = {
  subscribe: errorWritable.subscribe,
  set(errors: DraftError[]) {
    errorWritable.set(errors);
  },
  clear() {
    errorWritable.set([]);
  }
};

export const draftStore = {
  subscribe: draftWritable.subscribe,
  /** 任何录入修改都走这里：自动保存，清掉旧校样和旧的录入报错 */
  change(mutator: (d: StoryDraft) => void) {
    draftWritable.update((d) => {
      const next = structuredClone(d) as StoryDraft;
      mutator(next);
      persist(next);
      proofStore.clear();
      errorStore.clear();
      return next;
    });
  },
  reset() {
    const fresh = emptyDraft();
    try {
      // 重置视为“放弃草稿”：移除本地存档，刷新后不再提示恢复
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 存储不可用时安静忽略
    }
    proofStore.clear();
    errorStore.clear();
    draftWritable.set(fresh);
  },
  /** 载入一份草稿（用于“恢复草稿”），不会自动算校样 */
  load(draft: StoryDraft) {
    persist(draft);
    proofStore.clear();
    draftWritable.set(draft);
  },
  hasSaved: initial !== null,
  savedAt: initial?.savedAt ?? 0
};

/** 当前是否有可恢复的本地草稿 */
export function savedDraftInfo(): { draft: StoryDraft; savedAt: number } | null {
  return loadDraft();
}

/** 给需要同步快照的代码使用 */
export function currentDraft(): StoryDraft {
  return get(draftWritable);
}
