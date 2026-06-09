import { create } from 'zustand';
import {
  StrategySetRepository,
  createStrategySet,
  exportStrategySet,
  importStrategySet,
  generateId,
  type StrategySet,
  type Strategy,
} from '@fund/core';
import { storageAdapter } from '@/adapters/LocalStorageAdapter';

const repo = new StrategySetRepository(storageAdapter);

interface StrategyState {
  sets: StrategySet[];
  currentId: string | null;

  load: () => void;
  setCurrent: (id: string) => void;
  current: () => StrategySet | null;

  createSet: (name: string) => StrategySet;
  renameSet: (id: string, name: string) => void;
  removeSet: (id: string) => void;

  addStrategy: (setId: string, strategy: Omit<Strategy, 'id'>) => void;
  updateStrategy: (setId: string, strategy: Strategy) => void;
  removeStrategy: (setId: string, strategyId: string) => void;
  /** 批量删除策略 */
  removeStrategies: (setId: string, strategyIds: string[]) => void;
  /** 批量修改策略标的基金代码 */
  updateStrategiesFundCode: (setId: string, strategyIds: string[], fundCode: string) => void;

  /** 复制一个策略集为副本（新 id + 名称追加"(副本)"） */
  duplicateSet: (id: string) => StrategySet | null;
  /** 批量删除策略集 */
  removeSets: (ids: string[]) => void;

  exportSet: (id: string) => string;
  importFromString: (text: string) => StrategySet;
}

export const useStrategyStore = create<StrategyState>((set, get) => ({
  sets: [],
  currentId: null,

  load: () => {
    const sets = repo.listAll();
    set({ sets, currentId: get().currentId ?? sets[0]?.id ?? null });
  },

  setCurrent: (id) => set({ currentId: id }),

  current: () => {
    const { sets, currentId } = get();
    return sets.find((s) => s.id === currentId) ?? null;
  },

  createSet: (name) => {
    const s = createStrategySet({ name });
    repo.save(s);
    set({ sets: [...get().sets, s], currentId: s.id });
    return s;
  },

  renameSet: (id, name) => {
    const s = repo.get(id);
    if (!s) return;
    s.name = name;
    repo.save(s);
    get().load();
  },

  removeSet: (id) => {
    repo.remove(id);
    const remaining = get().sets.filter((s) => s.id !== id);
    set({
      sets: remaining,
      currentId: get().currentId === id ? (remaining[0]?.id ?? null) : get().currentId,
    });
  },

  addStrategy: (setId, strategy) => {
    const s = repo.get(setId);
    if (!s) return;
    s.strategies.push({ ...strategy, id: generateId('st') });
    repo.save(s);
    get().load();
  },

  updateStrategy: (setId, strategy) => {
    const s = repo.get(setId);
    if (!s) return;
    s.strategies = s.strategies.map((x) => (x.id === strategy.id ? strategy : x));
    repo.save(s);
    get().load();
  },

  removeStrategy: (setId, strategyId) => {
    const s = repo.get(setId);
    if (!s) return;
    s.strategies = s.strategies.filter((x) => x.id !== strategyId);
    repo.save(s);
    get().load();
  },

  removeStrategies: (setId, strategyIds) => {
    const s = repo.get(setId);
    if (!s) return;
    const ids = new Set(strategyIds);
    s.strategies = s.strategies.filter((x) => !ids.has(x.id));
    repo.save(s);
    get().load();
  },

  updateStrategiesFundCode: (setId, strategyIds, fundCode) => {
    const s = repo.get(setId);
    if (!s) return;
    const ids = new Set(strategyIds);
    s.strategies = s.strategies.map((x) => (ids.has(x.id) ? { ...x, fundCode } : x));
    repo.save(s);
    get().load();
  },

  duplicateSet: (id) => {
    const s = repo.get(id);
    if (!s) return null;
    // 通过导出再导入实现深拷贝 + 新 id + 重名副本（复用 codec 校验/重命名逻辑）
    const copy = importStrategySet(exportStrategySet(s), { existingNames: repo.existingNames() });
    repo.save(copy);
    set({ sets: [...get().sets, copy], currentId: copy.id });
    return copy;
  },

  removeSets: (ids) => {
    const idSet = new Set(ids);
    for (const id of ids) repo.remove(id);
    const remaining = get().sets.filter((s) => !idSet.has(s.id));
    set({
      sets: remaining,
      currentId:
        get().currentId && idSet.has(get().currentId!)
          ? (remaining[0]?.id ?? null)
          : get().currentId,
    });
  },

  exportSet: (id) => {
    const s = repo.get(id);
    if (!s) throw new Error('策略集不存在');
    return exportStrategySet(s);
  },

  importFromString: (text) => {
    const s = importStrategySet(text, { existingNames: repo.existingNames() });
    repo.save(s);
    set({ sets: [...get().sets, s], currentId: s.id });
    return s;
  },
}));
