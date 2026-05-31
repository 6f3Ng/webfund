/** 基金代码（6 位字符串） */
export type FundCode = string;

/** 基金类型 */
export type FundType =
  | 'EQUITY' // 股票型
  | 'HYBRID' // 混合型
  | 'BOND' // 债券型
  | 'INDEX' // 指数型
  | 'QDII' // QDII
  | 'MONEY' // 货币型
  | 'FOF'
  | 'OTHER';

/** 赎回费分档：持有满 minHoldDays 天适用 rate（按天数升序排列，取最后一个满足项） */
export interface RedeemFeeTier {
  /** 起始持有天数（含） */
  minHoldDays: number;
  /** 费率（如 0.015 = 1.5%） */
  rate: number;
}

/** 基金基础信息与费率配置 */
export interface FundInfo {
  code: FundCode;
  name: string;
  type: FundType;
  /** 申购费率，默认 0.015 */
  purchaseFeeRate: number;
  /** 赎回费分档，按 minHoldDays 升序 */
  redeemFeeTiers: RedeemFeeTier[];
  /** 转换费率（简化为单一费率），默认与申购一致 */
  convertFeeRate: number;
  /** 赎回资金到账滞后交易日数 T+N，默认 1 */
  settleLagDays: number;
}

/** 单日净值点 */
export interface NavPoint {
  /** 交易日 YYYY-MM-DD */
  date: string;
  /** 单位净值 */
  nav: number;
  /** 累计净值（可选） */
  accNav?: number;
  /** 当日涨跌幅 %（可选） */
  growthRate?: number;
}

/** 默认费率配置（股混型常见档位），可被 FundInfo 覆盖 */
export const DEFAULT_REDEEM_FEE_TIERS: RedeemFeeTier[] = [
  { minHoldDays: 0, rate: 0.015 },
  { minHoldDays: 7, rate: 0.005 },
  { minHoldDays: 365, rate: 0.0025 },
  { minHoldDays: 730, rate: 0 },
];

export function createDefaultFundInfo(code: FundCode, name = '', type: FundType = 'HYBRID'): FundInfo {
  return {
    code,
    name,
    type,
    purchaseFeeRate: 0.015,
    redeemFeeTiers: [...DEFAULT_REDEEM_FEE_TIERS],
    convertFeeRate: 0.005,
    settleLagDays: 1,
  };
}
