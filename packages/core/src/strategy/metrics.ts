import { diffDays } from '../utils/date';
import { roundRate } from '../utils/decimal';
import type { DailySnapshot } from './backtest-types';

/** 最大回撤（基于总资产曲线）：峰值到谷底的最大跌幅（正数） */
export function maxDrawdown(curve: DailySnapshot[]): number {
  return drawdownOf(curve.map((p) => p.totalAssets));
}

/** 持有最大回撤（基于时间加权持有指数）：剔除现金稀释与资金流入，反映持仓真实回撤（正数） */
export function holdingMaxDrawdown(curve: DailySnapshot[]): number {
  return drawdownOf(curve.map((p) => p.holdingIndex));
}

/** 通用：在一条数值序列上计算最大回撤（正数；序列非正值点跳过峰值更新） */
export function drawdownOf(series: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of series) {
    if (!Number.isFinite(v)) continue;
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return roundRate(maxDd);
}

/** 每个交易年的交易日数（用于波动率/比率年化） */
export const TRADING_DAYS_PER_YEAR = 252;

/** 日收益率序列：r_i = s_i / s_{i-1} − 1（s_{i-1}>0 才计入） */
export function dailyReturns(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    if (Number.isFinite(prev) && Number.isFinite(cur) && prev > 0) {
      out.push(cur / prev - 1);
    }
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** 样本标准差 */
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** 年化波动率 = 日收益标准差 × sqrt(交易日/年) */
export function annualizedVolatility(returns: number[]): number {
  return roundRate(stdDev(returns) * Math.sqrt(TRADING_DAYS_PER_YEAR));
}

/** 夏普比率 = (年化收益 − 无风险利率) / 年化波动率 */
export function sharpeRatio(annReturn: number, annVol: number, riskFree = 0): number {
  if (annVol <= 0) return 0;
  return roundRate((annReturn - riskFree) / annVol);
}

/** 索提诺比率 = (年化收益 − 无风险利率) / 年化下行波动率（只罚负收益） */
export function sortinoRatio(returns: number[], annReturn: number, riskFree = 0): number {
  const dailyRf = riskFree / TRADING_DAYS_PER_YEAR;
  const downside = returns.map((r) => Math.min(0, r - dailyRf));
  if (downside.length === 0) return 0;
  const dd = Math.sqrt(downside.reduce((a, b) => a + b * b, 0) / downside.length);
  const annDownside = dd * Math.sqrt(TRADING_DAYS_PER_YEAR);
  if (annDownside <= 0) return 0;
  return roundRate((annReturn - riskFree) / annDownside);
}

/** 卡玛比率 = 年化收益 / 最大回撤 */
export function calmarRatio(annReturn: number, maxDd: number): number {
  if (maxDd <= 0) return 0;
  return roundRate(annReturn / maxDd);
}

/** 盈利日占比（日收益 > 0 的天数 / 总天数） */
export function winningDaysRatio(returns: number[]): number {
  if (returns.length === 0) return 0;
  const wins = returns.filter((r) => r > 0).length;
  return roundRate(wins / returns.length);
}

/** 最大回撤区间明细（峰值日期、谷底日期、回撤幅度） */
export function drawdownDetail(
  curve: { date: string; value: number }[],
): { maxDrawdown: number; peakDate?: string; troughDate?: string } {
  let peak = -Infinity;
  let peakDate: string | undefined;
  let maxDd = 0;
  let ddPeakDate: string | undefined;
  let ddTroughDate: string | undefined;
  for (const p of curve) {
    if (!Number.isFinite(p.value)) continue;
    if (p.value > peak) {
      peak = p.value;
      peakDate = p.date;
    }
    if (peak > 0) {
      const dd = (peak - p.value) / peak;
      if (dd > maxDd) {
        maxDd = dd;
        ddPeakDate = peakDate;
        ddTroughDate = p.date;
      }
    }
  }
  return { maxDrawdown: roundRate(maxDd), peakDate: ddPeakDate, troughDate: ddTroughDate };
}

/** 总收益率 = (期末 - 初始) / 初始 */
export function totalReturn(initial: number, final: number): number {
  if (initial <= 0) return 0;
  return roundRate((final - initial) / initial);
}

/** 年化收益率：按区间自然天数折算（(1+总收益)^(365/天数) - 1） */
export function annualizedReturn(
  initial: number,
  final: number,
  startDate: string,
  endDate: string,
): number {
  if (initial <= 0) return 0;
  const days = Math.max(1, diffDays(startDate, endDate));
  const totalRet = final / initial;
  if (totalRet <= 0) return -1;
  const annual = Math.pow(totalRet, 365 / days) - 1;
  return roundRate(annual);
}
