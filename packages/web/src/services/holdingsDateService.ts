import type { ValuationSourceId } from '@fund/core';
import { fetchHistory } from '@/api/funds';
import { mapRequests } from '@/services/requestMode';
import { prefetchFundInfo, getCachedFundName } from '@/services/fundInfoService';
import type { DisplayQuote } from '@/stores/valuationStore';

/** 'YYYY-MM-DD' */
function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 指定日期的持仓行情结果（需求 2）：每只基金在该日期的净值、当日涨跌、上一交易日净值。
 * nav≤0 表示该日无有效净值（非交易日 / 早于成立 / 数据缺失），HomePage 据此显示 '-'。
 */
export interface HistoricalQuotesResult {
  /** fundCode -> DisplayQuote（isEstimate=false，source='history'） */
  quotes: Record<string, DisplayQuote>;
  /** fundCode -> 名称 */
  names: Record<string, string>;
}

/**
 * 取每只基金在「指定日期」的净值点与上一交易日净值，计算当日涨跌。
 *
 * - 历史数据统一用 eastmoney（蛋卷历史可选，但持仓页日期查询固定用 eastmoney 保证完整性）。
 * - 若所选日期非该基金交易日（无净值点），取该日期之前最近的一个净值点（标注其真实日期）。
 * - 当日涨跌优先取接口 growthPct，否则用 (nav − prevNav)/prevNav 计算。
 * - 同时成对预取基金名称（与持仓页同源）。
 */
export async function fetchHistoricalQuotes(
  codes: string[],
  date: string,
  source: ValuationSourceId = 'eastmoney',
): Promise<HistoricalQuotesResult> {
  if (codes.length === 0) return { quotes: {}, names: {} };
  const histSource = source === 'danjuan' ? 'danjuan' : 'eastmoney';

  // 向前取约 20 天，保证能拿到所选日期及其上一交易日
  const end = date;
  const startD = new Date(`${date}T00:00:00`);
  startD.setDate(startD.getDate() - 25);
  const start = dateStr(startD);

  const fallback = (code: string, e: unknown): DisplayQuote => ({
    fundCode: code,
    nav: 0,
    growthPct: 0,
    isEstimate: false,
    time: date,
    source: 'history',
    error: e instanceof Error ? e.message : '净值获取失败',
  });

  const results = await mapRequests(codes, async (code) => {
    const [quote] = await Promise.all([
      (async (): Promise<DisplayQuote> => {
        try {
          const { points } = await fetchHistory(code, start, end, histSource);
          if (points.length === 0) throw new Error('该日期无净值数据');
          // 取「<= 所选日期」的最后一个点（所选日为交易日则即该日）
          const idx = points.reduce((acc, p, i) => (p.date <= date ? i : acc), -1);
          if (idx < 0) throw new Error('所选日期早于该基金最早净值');
          const cur = points[idx];
          const prev = idx >= 1 ? points[idx - 1] : undefined;
          const growthPct =
            cur.growthPct ?? (prev && prev.nav > 0 ? ((cur.nav - prev.nav) / prev.nav) * 100 : 0);
          return {
            fundCode: code,
            nav: cur.nav,
            growthPct,
            prevNav: prev?.nav,
            isEstimate: false,
            time: cur.date,
            source: 'history',
          };
        } catch (e) {
          return fallback(code, e);
        }
      })(),
      prefetchFundInfo(code).catch(() => undefined),
    ]);
    return quote;
  });

  const quotes: Record<string, DisplayQuote> = {};
  const names: Record<string, string> = {};
  for (const q of results) {
    quotes[q.fundCode] = q;
    const nm = getCachedFundName(q.fundCode);
    if (nm) names[q.fundCode] = nm;
  }
  return { quotes, names };
}
