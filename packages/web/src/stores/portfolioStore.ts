import { create } from 'zustand';
import {
  PortfolioRepository,
  createPortfolio,
  submitBuy,
  submitSell,
  submitConvert,
  cancelOrder,
  settlePortfolio,
  exportPortfolio,
  importPortfolio,
  type Portfolio,
  type NavProvider,
  type InitialPosition,
  type StrategyAction,
} from '@fund/core';
import { storageAdapter } from '@/adapters/LocalStorageAdapter';
import { getTradingCalendar } from '@/services/calendarService';
import { prefetchFundInfo, fundInfoProvider, getConfirmLagDays } from '@/services/fundInfoService';
import { mapRequests } from '@/services/requestMode';
import { fetchHistory } from '@/api/funds';

const repo = new PortfolioRepository(storageAdapter);

/** 净值缓存：fundCode -> date -> nav，用于结算（确认日收盘净值） */
const navCache = new Map<string, Map<string, number>>();

function setNav(code: string, date: string, nav: number) {
  if (!navCache.has(code)) navCache.set(code, new Map());
  navCache.get(code)!.set(date, nav);
}

const navProvider: NavProvider = (code, date) => navCache.get(code)?.get(date);

/** 拉取某基金 [start, today] 的历史净值填入缓存（用于结算待确认订单） */
async function loadNavForSettlement(code: string, start: string, end: string): Promise<void> {
  try {
    const { points } = await fetchHistory(code, start, end);
    for (const p of points) setNav(code, p.date, p.nav);
  } catch {
    // 净值不可得则订单保持 pending
  }
}

/**
 * 是否存在在途交易状态：`pendingOrders`/`pendingCash`/`pendingShares` 任一非空为 true。
 * 历史已确认流水 `transactions` 不计入。
 */
export function hasInFlightState(pf: Portfolio): boolean {
  return pf.pendingOrders.length > 0 || pf.pendingCash.length > 0 || pf.pendingShares.length > 0;
}

/** UI 是否允许编辑（语义取反，便于阅读），供 store 与 PortfoliosPage 共用。 */
export const canEdit = (pf: Portfolio): boolean => !hasInFlightState(pf);

interface PortfolioState {
  portfolios: Portfolio[];
  currentId: string | null;
  loading: boolean;

  load: () => void;
  setCurrent: (id: string) => void;
  current: () => Portfolio | null;

  create: (name: string, initialCash: number, positions?: InitialPosition[]) => Portfolio;
  rename: (id: string, name: string) => void;
  edit: (
    id: string,
    data: { name: string; initialCash: number; positions?: InitialPosition[] },
  ) => Portfolio;
  remove: (id: string) => void;

  buy: (params: { fundCode: string; amount: number; submitAt?: string }) => Promise<void>;
  sell: (params: { fundCode: string; shares: number; submitAt?: string }) => Promise<void>;
  convert: (params: {
    fromFundCode: string;
    toFundCode: string;
    shares: number;
    submitAt?: string;
  }) => Promise<void>;
  cancel: (orderId: string) => void;
  /** 结算所有待确认订单（拉取必要净值后推进到今天） */
  settle: () => Promise<void>;

  /** 配置该集合应用的策略集 id 列表 */
  setStrategySets: (id: string, strategySetIds: string[]) => void;
  /** 设置某底仓策略的「已建仓」标记：built=true 锁定不再买入；false 解锁可再次建仓 */
  setBaseStrategyBuilt: (strategyId: string, built: boolean) => void;
  /** 按预览动作执行策略（下单），返回实际下单数。
   *  `executedBaseStrategyIds` 为本次触发的底仓策略 id，执行后记录避免重复建仓。 */
  executeActions: (
    actions: StrategyAction[],
    navByCode: Record<string, number>,
    executedBaseStrategyIds?: string[],
  ) => Promise<number>;

  exportCurrent: () => string;
  importFromString: (text: string) => Portfolio;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 16);
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  portfolios: [],
  currentId: null,
  loading: false,

  load: () => {
    const portfolios = repo.listAll();
    set({
      portfolios,
      currentId: get().currentId ?? portfolios[0]?.id ?? null,
    });
  },

  setCurrent: (id) => set({ currentId: id }),

  current: () => {
    const { portfolios, currentId } = get();
    return portfolios.find((p) => p.id === currentId) ?? null;
  },

  create: (name, initialCash, positions) => {
    const pf = createPortfolio({ name, initialCash, positions });
    repo.save(pf);
    set({ portfolios: [...get().portfolios, pf], currentId: pf.id });
    // 异步补全持仓基金名称（不阻塞创建），按设置顺序/并发预取
    void mapRequests(
      pf.positions.map((p) => p.fundCode),
      (code) => prefetchFundInfo(code),
    );
    return pf;
  },

  rename: (id, name) => {
    const pf = repo.get(id);
    if (!pf) return;
    pf.name = name;
    repo.save(pf);
    get().load();
  },

  edit: (id, data) => {
    const existing = repo.get(id);
    if (!existing) throw new Error('集合不存在');

    // 纵深防御：在途交易时拒绝编辑（需求 3.3）
    if (hasInFlightState(existing)) {
      throw new Error('存在在途交易，暂不可编辑');
    }

    // 复用工厂重建：保留原 id 与 createdAt（需求 2.2）。
    // createPortfolio 内部先校验后构造：initialCash<0 或任一 costPrice<0 时先抛错，
    // 因此下方 repo.save / set 不会执行，既有集合不被修改（需求 2.6/2.7/3.3）。
    const rebuilt = createPortfolio({
      name: data.name,
      initialCash: data.initialCash,
      positions: data.positions,
      id: existing.id,
      createdAt: existing.createdAt,
    });

    repo.save(rebuilt);
    set({
      portfolios: get().portfolios.map((p) => (p.id === id ? rebuilt : p)),
    });

    // 异步补全持仓基金名称（需求 2.5），不阻塞编辑，按设置顺序/并发预取
    void mapRequests(
      rebuilt.positions.map((p) => p.fundCode),
      (code) => prefetchFundInfo(code),
    );

    return rebuilt;
  },

  remove: (id) => {
    repo.remove(id);
    const remaining = get().portfolios.filter((p) => p.id !== id);
    set({
      portfolios: remaining,
      currentId: get().currentId === id ? (remaining[0]?.id ?? null) : get().currentId,
    });
  },

  buy: async ({ fundCode, amount, submitAt }) => {
    const pf = get().current();
    if (!pf) throw new Error('未选择持仓集合');
    await prefetchFundInfo(fundCode);
    const calendar = await getTradingCalendar();
    submitBuy(pf, { fundCode, amount, submitAt: submitAt ?? nowIso() }, calendar, {
      confirmLagDays: getConfirmLagDays(fundCode),
    });
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
    await get().settle();
  },

  sell: async ({ fundCode, shares, submitAt }) => {
    const pf = get().current();
    if (!pf) throw new Error('未选择持仓集合');
    await prefetchFundInfo(fundCode);
    const calendar = await getTradingCalendar();
    submitSell(pf, { fundCode, shares, submitAt: submitAt ?? nowIso() }, calendar, {
      confirmLagDays: getConfirmLagDays(fundCode),
    });
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
    await get().settle();
  },

  convert: async ({ fromFundCode, toFundCode, shares, submitAt }) => {
    const pf = get().current();
    if (!pf) throw new Error('未选择持仓集合');
    await prefetchFundInfo(toFundCode);
    await prefetchFundInfo(fromFundCode);
    const calendar = await getTradingCalendar();
    submitConvert(
      pf,
      { fromFundCode, toFundCode, shares, submitAt: submitAt ?? nowIso() },
      calendar,
      // 转换确认以转入基金的确认期为准（如转入 QDII 更久）
      { confirmLagDays: Math.max(getConfirmLagDays(fromFundCode), getConfirmLagDays(toFundCode)) },
    );
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
    await get().settle();
  },

  cancel: (orderId) => {
    const pf = get().current();
    if (!pf) return;
    // 按场外基金运作限制校验：确认日 15:00 前可撤，已过成交确认时点则拒绝（需求 3）
    cancelOrder(pf, orderId, { now: nowIso() });
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
  },

  settle: async () => {
    const pf = get().current();
    if (!pf || pf.pendingOrders.length === 0) return;
    const calendar = await getTradingCalendar();

    // 为每个待确认订单的标的预取净值（确认日附近）与基金信息（名称/类型/份额类别 → 费率）
    const codes = new Set<string>();
    for (const o of pf.pendingOrders) {
      codes.add(o.fundCode);
      if (o.targetFundCode) codes.add(o.targetFundCode);
    }
    const end = today();
    // 取最早确认日作为起点
    const earliest = pf.pendingOrders
      .map((o) => o.confirmDate)
      .sort()[0];
    // 每只标的：结算净值（/api/history）与基金信息（/api/fund-info）两接口并行；
    // 不同标的之间按设置顺序或并发执行（顺序模式规避第三方接口 429 限流）
    await mapRequests([...codes], (c) =>
      Promise.all([loadNavForSettlement(c, earliest, end), prefetchFundInfo(c)]),
    );

    settlePortfolio(pf, { asOf: end, calendar, getNav: navProvider, getFundInfo: fundInfoProvider });
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
  },

  setStrategySets: (id, strategySetIds) => {
    const pf = repo.get(id);
    if (!pf) return;
    pf.settings = { ...pf.settings, strategySetIds };
    repo.save(pf);
    set({ portfolios: get().portfolios.map((p) => (p.id === id ? pf : p)) });
  },

  setBaseStrategyBuilt: (strategyId, built) => {
    const pf = get().current();
    if (!pf) return;
    const prev = pf.settings.executedBaseStrategyIds ?? [];
    const has = prev.includes(strategyId);
    if (built === has) return; // 状态未变化
    const next = built ? [...prev, strategyId] : prev.filter((id) => id !== strategyId);
    pf.settings = { ...pf.settings, executedBaseStrategyIds: next };
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
  },

  executeActions: async (actions, navByCode, executedBaseStrategyIds) => {
    const pf = get().current();
    if (!pf) throw new Error('未选择持仓集合');
    if (actions.length === 0) return 0;
    const calendar = await getTradingCalendar();
    const submittedAt = nowIso();
    let count = 0;

    // 先卖后买（动作已按冲突策略归并排序）。卖出回款 T+N 到账，故买入仅以当前可用现金为限。
    for (const action of actions) {
      const nav = navByCode[action.fundCode];
      try {
        if (action.side === 'BUY') {
          const amount = Math.min(action.amount ?? 0, pf.cash);
          if (amount <= 0) continue;
          submitBuy(pf, { fundCode: action.fundCode, amount, submitAt: submittedAt }, calendar, {
            confirmLagDays: getConfirmLagDays(action.fundCode),
          });
          count++;
        } else {
          // 卖出份额优先级：ratio > amount(按估值换算) > shares；并以可卖份额封顶
          const pos = pf.positions.find((p) => p.fundCode === action.fundCode);
          if (!pos || pos.availableShares <= 0) continue;
          let shares: number;
          if (action.ratio !== undefined) {
            shares = pos.shares * action.ratio;
          } else if (action.amount !== undefined && nav && nav > 0) {
            shares = action.amount / nav;
          } else {
            shares = action.shares ?? 0;
          }
          shares = Math.min(shares, pos.availableShares);
          if (shares <= 0) continue;
          submitSell(pf, { fundCode: action.fundCode, shares, submitAt: submittedAt }, calendar, {
            confirmLagDays: getConfirmLagDays(action.fundCode),
          });
          count++;
        }
      } catch {
        // 单笔失败（现金/份额不足等）跳过，不影响其余动作
      }
    }

    // 记录本次已建底仓的策略 id（去重），避免后续手动执行重复建仓
    if (count > 0 && executedBaseStrategyIds && executedBaseStrategyIds.length > 0) {
      const prev = pf.settings.executedBaseStrategyIds ?? [];
      pf.settings = {
        ...pf.settings,
        executedBaseStrategyIds: [...new Set([...prev, ...executedBaseStrategyIds])],
      };
    }

    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
    await get().settle();
    return count;
  },

  exportCurrent: () => {
    const pf = get().current();
    if (!pf) throw new Error('未选择持仓集合');
    return exportPortfolio(pf);
  },

  importFromString: (text) => {
    const pf = importPortfolio(text, { existingNames: repo.existingNames() });
    repo.save(pf);
    set({ portfolios: [...get().portfolios, pf], currentId: pf.id });
    return pf;
  },
}));
