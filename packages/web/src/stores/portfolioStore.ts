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
} from '@fund/core';
import { storageAdapter } from '@/adapters/LocalStorageAdapter';
import { getTradingCalendar } from '@/services/calendarService';
import { prefetchFundInfo, fundInfoProvider } from '@/services/fundInfoService';
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

interface PortfolioState {
  portfolios: Portfolio[];
  currentId: string | null;
  loading: boolean;

  load: () => void;
  setCurrent: (id: string) => void;
  current: () => Portfolio | null;

  create: (name: string, initialCash: number, positions?: InitialPosition[]) => Portfolio;
  rename: (id: string, name: string) => void;
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
    // 异步补全持仓基金名称（不阻塞创建）
    for (const p of pf.positions) void prefetchFundInfo(p.fundCode);
    return pf;
  },

  rename: (id, name) => {
    const pf = repo.get(id);
    if (!pf) return;
    pf.name = name;
    repo.save(pf);
    get().load();
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
    submitBuy(pf, { fundCode, amount, submitAt: submitAt ?? nowIso() }, calendar);
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
    await get().settle();
  },

  sell: async ({ fundCode, shares, submitAt }) => {
    const pf = get().current();
    if (!pf) throw new Error('未选择持仓集合');
    const calendar = await getTradingCalendar();
    submitSell(pf, { fundCode, shares, submitAt: submitAt ?? nowIso() }, calendar);
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
    await get().settle();
  },

  convert: async ({ fromFundCode, toFundCode, shares, submitAt }) => {
    const pf = get().current();
    if (!pf) throw new Error('未选择持仓集合');
    await prefetchFundInfo(toFundCode);
    const calendar = await getTradingCalendar();
    submitConvert(pf, { fromFundCode, toFundCode, shares, submitAt: submitAt ?? nowIso() }, calendar);
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
    await get().settle();
  },

  cancel: (orderId) => {
    const pf = get().current();
    if (!pf) return;
    cancelOrder(pf, orderId);
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
  },

  settle: async () => {
    const pf = get().current();
    if (!pf || pf.pendingOrders.length === 0) return;
    const calendar = await getTradingCalendar();

    // 为每个待确认订单的标的预取净值（确认日附近）
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
    await Promise.all([...codes].map((c) => loadNavForSettlement(c, earliest, end)));

    settlePortfolio(pf, { asOf: end, calendar, getNav: navProvider, getFundInfo: fundInfoProvider });
    repo.save(pf);
    set({ portfolios: [...get().portfolios] });
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
