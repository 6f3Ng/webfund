import {
  annualizedReturn,
  annualizedVolatility,
  calmarRatio,
  dailyReturns,
  drawdownDetail,
  sharpeRatio,
  sortinoRatio,
  totalReturn,
  winningDaysRatio,
} from '@fund/core';
import { fetchFundInfo, fetchHistory, fetchHoldings } from '@/api/funds';
import type { NavPointResponse, HoldingResponse } from '@/api/funds';
import { mapRequests } from '@/services/requestMode';
import { prefetchFundInfo, getCachedFundName } from '@/services/fundInfoService';

/** 单只基金在指定区间内的明细 + 指标（需求 3：多维度展示基金参数）。 */
export interface FundDetail {
  code: string;
  name: string;
  type?: string;
  /** 区间历史净值（升序） */
  points: NavPointResponse[];
  /** 重仓持仓（前 N） */
  holdings: HoldingResponse[];
  /** 持仓披露报告期 */
  holdingsReportDate?: string;
  /** 重仓合计权重 % */
  holdingsTotalWeight?: number;
  /** 区间业绩指标 */
  metrics: FundMetrics;
  /** 数据获取错误（部分接口失败时仍展示其余数据） */
  error?: string;
}

/** 区间业绩指标 */
export interface FundMetrics {
  /** 期初净值 */
  startNav: number;
  /** 期末净值 */
  endNav: number;
  /** 最新净值日期 */
  latestDate: string;
  /** 区间收益率（小数） */
  totalReturn: number;
  /** 年化收益率（小数） */
  annualizedReturn: number;
  /** 最大回撤（小数，正数） */
  maxDrawdown: number;
  maxDrawdownPeakDate?: string;
  maxDrawdownTroughDate?: string;
  /** 回撤修复日期（谷底后回到峰值；未修复为 undefined） */
  maxDrawdownRecoveryDate?: string;
  /** 回撤修复天数（谷底→修复的交易日数；未修复为 undefined） */
  maxDrawdownRecoveryDays?: number;
  /** 期末仍未修复时，谷底至期末的交易日数 */
  maxDrawdownDaysSinceTrough?: number;
  /** 历史已修复的最大回撤幅度（正数；当前最大回撤未修复时用于补充展示），无则为 0 */
  recoveredMaxDrawdown?: number;
  recoveredMaxDrawdownTroughDate?: string;
  recoveredMaxDrawdownRecoveryDate?: string;
  recoveredMaxDrawdownRecoveryDays?: number;
  /** 年化波动率（小数） */
  annualizedVolatility: number;
  /** 夏普比率 */
  sharpeRatio: number;
  /** 索提诺比率 */
  sortinoRatio: number;
  /** 卡玛比率 */
  calmarRatio: number;
  /** 盈利日占比（小数） */
  winningDaysRatio: number;
  /** 区间交易日数 */
  tradingDays: number;
}

const EMPTY_METRICS: FundMetrics = {
  startNav: 0,
  endNav: 0,
  latestDate: '',
  totalReturn: 0,
  annualizedReturn: 0,
  maxDrawdown: 0,
  annualizedVolatility: 0,
  sharpeRatio: 0,
  sortinoRatio: 0,
  calmarRatio: 0,
  winningDaysRatio: 0,
  tradingDays: 0,
};

/** 由区间净值序列计算业绩指标（复用 @fund/core 的指标工具）。 */
export function computeFundMetrics(points: NavPointResponse[], riskFreeRate = 0): FundMetrics {
  if (points.length === 0) return EMPTY_METRICS;
  const navSeries = points.map((p) => p.nav);
  const startNav = navSeries[0];
  const endNav = navSeries[navSeries.length - 1];
  const tr = totalReturn(startNav, endNav);
  const ar = annualizedReturn(startNav, endNav, points[0].date, points[points.length - 1].date);
  const dd = drawdownDetail(points.map((p) => ({ date: p.date, value: p.nav })));
  const returns = dailyReturns(navSeries);
  const vol = annualizedVolatility(returns);
  const sharpe = sharpeRatio(ar, vol, riskFreeRate);
  const sortino = sortinoRatio(returns, ar, riskFreeRate);
  const calmar = calmarRatio(ar, dd.maxDrawdown);
  const win = winningDaysRatio(returns);
  return {
    startNav,
    endNav,
    latestDate: points[points.length - 1].date,
    totalReturn: tr,
    annualizedReturn: ar,
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownPeakDate: dd.peakDate,
    maxDrawdownTroughDate: dd.troughDate,
    maxDrawdownRecoveryDate: dd.recoveryDate,
    maxDrawdownRecoveryDays: dd.recoveryDays,
    maxDrawdownDaysSinceTrough: dd.daysSinceTrough,
    recoveredMaxDrawdown: dd.recoveredMaxDrawdown,
    recoveredMaxDrawdownTroughDate: dd.recoveredTroughDate,
    recoveredMaxDrawdownRecoveryDate: dd.recoveredRecoveryDate,
    recoveredMaxDrawdownRecoveryDays: dd.recoveredRecoveryDays,
    annualizedVolatility: vol,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    calmarRatio: calmar,
    winningDaysRatio: win,
    tradingDays: points.length,
  };
}

/**
 * 加载选中基金在指定区间的明细（基金信息 + 历史净值 + 重仓持仓 + 区间指标）。
 *
 * 按当前请求模式（顺序 / 并发）逐只加载，规避第三方接口限流；
 * 单只基金内部 fund-info / history / holdings 并行。返回顺序与输入一致。
 */
export async function loadFundDetails(
  codes: string[],
  start: string,
  end: string,
): Promise<FundDetail[]> {
  if (codes.length === 0) return [];
  return mapRequests(codes, async (code) => {
    let points: NavPointResponse[] = [];
    let holdings: HoldingResponse[] = [];
    let holdingsReportDate: string | undefined;
    let holdingsTotalWeight: number | undefined;
    let type: string | undefined;
    let error: string | undefined;

    const [histRes, holdRes] = await Promise.allSettled([
      fetchHistory(code, start, end),
      fetchHoldings(code, 10),
    ]);
    // 名称/类型：优先 fund-info（同时回填名称缓存）
    try {
      const info = await fetchFundInfo(code);
      type = info.type;
    } catch {
      // 忽略，名称仍可由 prefetch 提供
    }
    await prefetchFundInfo(code).catch(() => undefined);

    if (histRes.status === 'fulfilled') {
      points = histRes.value.points;
    } else {
      error = histRes.reason instanceof Error ? histRes.reason.message : '历史净值获取失败';
    }
    if (holdRes.status === 'fulfilled') {
      holdings = holdRes.value.holdings;
      holdingsReportDate = holdRes.value.reportDate;
      holdingsTotalWeight = holdRes.value.totalWeightPct;
    }

    return {
      code,
      name: getCachedFundName(code) ?? code,
      type,
      points,
      holdings,
      holdingsReportDate,
      holdingsTotalWeight,
      metrics: computeFundMetrics(points),
      error,
    } as FundDetail;
  });
}
