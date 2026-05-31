import type { ValuationSourceId } from '@fund/core';
import { apiGet } from './client';

/** Workers 返回的估值结构（与 core Valuation 对齐，含可选 error） */
export interface ValuationResponse {
  fundCode: string;
  name?: string;
  source: ValuationSourceId;
  estimatedNav: number;
  estimatedGrowthPct: number;
  estimatedAt: string;
  baseNav?: number;
  baseNavDate?: string;
  confidence?: number;
  error?: string;
}

export interface NavPointResponse {
  date: string;
  nav: number;
  accNav?: number;
  growthPct?: number;
}

export interface FundInfoResponse {
  code: string;
  name: string;
  type?: string;
}

export interface HoldingResponse {
  symbol: string;
  name: string;
  weightPct: number;
}

export interface FundHoldingsResponse {
  fundCode: string;
  reportDate?: string;
  holdings: HoldingResponse[];
  totalWeightPct: number;
}

export interface CalendarResponse {
  coveredYears: number[];
  holidays: string[];
  extraTradingDays: string[];
}

/** 接口估值（天天/蛋卷） */
export function fetchValuation(
  codes: string[],
  source: ValuationSourceId,
): Promise<ValuationResponse[]> {
  return apiGet<ValuationResponse[]>('/valuation', { codes: codes.join(','), source });
}

/** 自建估值 */
export function fetchSelfValuation(codes: string[]): Promise<ValuationResponse[]> {
  return apiGet<ValuationResponse[]>('/self-nav', { codes: codes.join(',') });
}

/** 历史净值 */
export function fetchHistory(
  code: string,
  start: string,
  end: string,
  source: 'eastmoney' | 'danjuan' = 'eastmoney',
): Promise<{ code: string; points: NavPointResponse[] }> {
  return apiGet('/history', { code, start, end, source });
}

/** 基金信息 */
export function fetchFundInfo(code: string): Promise<FundInfoResponse> {
  return apiGet<FundInfoResponse>('/fund-info', { code });
}

/** 基金公开持仓 */
export function fetchHoldings(code: string, top = 10): Promise<FundHoldingsResponse> {
  return apiGet<FundHoldingsResponse>('/holdings', { code, top });
}

/** 交易日历 */
export function fetchCalendar(year?: number): Promise<CalendarResponse> {
  return apiGet<CalendarResponse>('/calendar', year ? { year } : undefined);
}
