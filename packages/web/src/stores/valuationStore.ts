import { create } from 'zustand';
import type { Valuation, ValuationSourceId } from '@fund/core';
import { createAggregator } from '@/api/providers';
import { fetchHistory } from '@/api/funds';
import { getTradingCalendar } from '@/services/calendarService';
import { useSettingsStore } from './settingsStore';

const aggregator = createAggregator();

/** 估值时钟窗口下界：9:15（含集合竞价）。上界不设固定时刻，由"当日净值是否已公布"决定。 */
function estimateClockOpen(now: Date): boolean {
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= 9 * 60 + 15;
}

/** 仅按时间窗口的粗略判断（不含节假日），供自动刷新轮询使用：交易日 9:15-15:00。 */
export function isTradingTime(now = new Date()): boolean {
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60;
}

function todayStr(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * 是否处于"估值展示窗口"：交易日（经交易日历，排除节假日）且已过 9:15（集合竞价开始）。
 * 该窗口覆盖：集合竞价、盘中（含午间休市）、收盘后——直到当日净值公布。
 * "当日净值是否已公布"由各基金的 baseNavDate 在 refresh 中按基金细化判断。
 */
export async function isEstimating(now = new Date()): Promise<boolean> {
  if (!estimateClockOpen(now)) return false;
  try {
    const calendar = await getTradingCalendar();
    return calendar.isTradingDay(todayStr(now));
  } catch {
    // 日历不可用时退化为周末判断
    return now.getDay() !== 0 && now.getDay() !== 6;
  }
}

/**
 * 统一的展示行情。交易时段用估值（isEstimate=true），否则用已公布的实际净值。
 * 不论选择何种数据源都遵循此规则。
 */
export interface DisplayQuote {
  fundCode: string;
  /** 用于展示与市值计算的净值（估值或实际净值） */
  nav: number;
  /** 当日涨跌幅 %（估值涨跌或实际净值涨跌） */
  growthPct: number;
  /** 上一交易日净值（用于当日盈亏） */
  prevNav?: number;
  /** true=盘中估值，false=已公布实际净值 */
  isEstimate: boolean;
  /** 数据时间/日期 */
  time: string;
  source: ValuationSourceId | 'history';
  /** 自建估值覆盖率（仅 self-calc 估值时有） */
  confidence?: number;
  error?: string;
}

interface ValuationState {
  /** fundCode -> DisplayQuote（已按交易时段规则归一） */
  quotes: Record<string, DisplayQuote>;
  /** 当前展示的是估值还是实际净值 */
  estimating: boolean;
  loading: boolean;
  lastUpdated: string | null;
  error: string | null;
  refresh: (codes: string[], source?: ValuationSourceId) => Promise<void>;
  /** 多源对比（始终拉取估值，用于对比面板） */
  compare: (
    codes: string[],
    sources: ValuationSourceId[],
  ) => Promise<Map<string, Map<ValuationSourceId, Valuation>>>;
  clear: () => void;
}

/** 估值 DTO → DisplayQuote（交易时段分支） */
function fromValuation(v: Valuation): DisplayQuote {
  return {
    fundCode: v.fundCode,
    nav: v.estimatedNav || v.baseNav || 0,
    growthPct: v.estimatedGrowthPct,
    prevNav: v.baseNav,
    isEstimate: true,
    time: v.estimatedAt,
    source: v.source,
    confidence: v.confidence,
    error: v.error,
  };
}

/** 取实际净值：历史接口最近两点 → 最新净值 + 实际当日涨跌 */
async function fetchActualQuote(code: string, source: ValuationSourceId): Promise<DisplayQuote> {
  // self-calc 无历史接口，历史数据统一用 eastmoney；danjuan 用 danjuan
  const histSource = source === 'danjuan' ? 'danjuan' : 'eastmoney';
  // 取最近一段时间，保证至少两条
  const end = todayStr();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 20);
  const start = todayStr(startDate);

  const { points } = await fetchHistory(code, start, end, histSource);
  if (points.length === 0) throw new Error('无净值数据');
  const last = points[points.length - 1];
  const prev = points.length >= 2 ? points[points.length - 2] : undefined;
  const growthPct =
    last.growthPct ?? (prev && prev.nav > 0 ? ((last.nav - prev.nav) / prev.nav) * 100 : 0);
  return {
    fundCode: code,
    nav: last.nav,
    growthPct,
    prevNav: prev?.nav,
    isEstimate: false,
    time: last.date,
    source: 'history',
  };
}

/** 收盘后（>15:00） */
function isPostClose(now: Date): boolean {
  return now.getHours() * 60 + now.getMinutes() > 15 * 60;
}

export const useValuationStore = create<ValuationState>((set, get) => ({
  quotes: {},
  estimating: false,
  loading: false,
  lastUpdated: null,
  error: null,

  refresh: async (codes, source) => {
    if (codes.length === 0) return;
    const src = (source ??
      useSettingsStore.getState().settings.defaultValuationSource) as ValuationSourceId;
    set({ loading: true, error: null });
    try {
      const now = new Date();
      const windowOpen = await isEstimating(now); // 交易日 && ≥9:15
      const map = { ...get().quotes };

      const actualFallback = (code: string, e: unknown): DisplayQuote => ({
        fundCode: code,
        nav: 0,
        growthPct: 0,
        isEstimate: false,
        time: '',
        source: 'history',
        error: e instanceof Error ? e.message : '净值获取失败',
      });

      if (!windowOpen) {
        // 估值窗口外（非交易日 / 节假日 / 9:15 前）：展示已公布的实际净值
        const results = await Promise.all(
          codes.map((code) => fetchActualQuote(code, src).catch((e) => actualFallback(code, e))),
        );
        for (const q of results) map[q.fundCode] = q;
      } else if (!isPostClose(now)) {
        // 集合竞价 + 盘中（9:15-15:00，含午休）：今日净值不可能已公布 → 直接用估值
        const vals = await aggregator.fetchFrom(src, codes);
        for (const v of vals) map[v.fundCode] = fromValuation(v);
      } else {
        // 收盘后：估值持续展示，直到当日净值公布；逐基金判断（历史最新日 === 今日 → 已公布，用实际）
        const today = todayStr(now);
        const [vals, actuals] = await Promise.all([
          aggregator.fetchFrom(src, codes).catch(() => []),
          Promise.all(
            codes.map((code) =>
              fetchActualQuote(code, src).catch((e) => actualFallback(code, e)),
            ),
          ),
        ]);
        const valMap = new Map(vals.map((v) => [v.fundCode, v]));
        for (const code of codes) {
          const actual = actuals.find((a) => a.fundCode === code);
          if (actual && !actual.error && actual.time === today) {
            // 今日净值已公布 → 用实际
            map[code] = actual;
          } else {
            // 未公布 → 继续展示估值；估值缺失时回退实际
            const v = valMap.get(code);
            map[code] = v ? fromValuation(v) : (actual ?? actualFallback(code, null));
          }
        }
      }

      // 全局标志：是否仍有估值在展示（驱动列标题与状态标签）
      const estimating = codes.some((c) => map[c]?.isEstimate);
      set({ quotes: map, estimating, loading: false, lastUpdated: new Date().toISOString() });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : '行情获取失败' });
    }
  },

  compare: async (codes, sources) => {
    return aggregator.fetchCompare(sources, codes);
  },

  clear: () => set({ quotes: {}, lastUpdated: null }),
}));
