import type { FundCode, FundInfo } from '../domain';

/**
 * 净值提供器：返回某基金在某交易日的收盘单位净值。
 * 若该日净值尚未公布（如当日收盘前），返回 undefined → 订单保持 PENDING。
 */
export type NavProvider = (fundCode: FundCode, date: string) => number | undefined;

/** 基金信息提供器：返回费率等配置。 */
export type FundInfoProvider = (fundCode: FundCode) => FundInfo;
