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
  /**
   * 份额确认滞后交易日数：申报成交日（T）之后第 confirmLagDays 个交易日确认份额（T+N 确认）。
   * 普通场外基金默认 1（T+1 确认）；QDII / 港基 / FOF 等特殊产品确认更久（如 T+2）。
   */
  confirmLagDays: number;
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

/** 基金份额类别（影响申购费：A 类前端收费，C 类通常免申购费、收销售服务费） */
export type ShareClass = 'A' | 'C' | 'UNKNOWN';

/**
 * 从基金名称粗略识别份额类别（A/C）。
 * 约定：名称以「A」或「C」结尾，或含「A类」「C类」「(A)」「(C)」等标记时判定；
 * 无法识别返回 UNKNOWN（调用方按 A 类默认费率处理）。
 */
export function detectShareClass(name?: string): ShareClass {
  if (!name) return 'UNKNOWN';
  const n = name.trim().toUpperCase();
  // 末尾的 A/C（如「招商中证白酒指数(LOF)A」「易方达蓝筹C」）
  const tail = /([AC])\s*$/.exec(n);
  if (tail) return tail[1] as ShareClass;
  // 显式标记「A类/C类」「(A)/(C)」「A份额/C份额」
  if (/[（(]\s*C\s*[)）]|C\s*类|C\s*份额/.test(n)) return 'C';
  if (/[（(]\s*A\s*[)）]|A\s*类|A\s*份额/.test(n)) return 'A';
  return 'UNKNOWN';
}

export function createDefaultFundInfo(code: FundCode, name = '', type: FundType = 'HYBRID'): FundInfo {
  return {
    code,
    name,
    type,
    purchaseFeeRate: 0.015,
    redeemFeeTiers: [...DEFAULT_REDEEM_FEE_TIERS],
    convertFeeRate: 0.005,
    settleLagDays: defaultSettleLagDays(type),
    confirmLagDays: defaultConfirmLagDays(type),
  };
}

/**
 * 按基金类型推断份额确认滞后交易日数（T+N 确认）。
 * - 普通场外基金（股票/混合/债券/指数/货币/FOF 之外）：T+1 确认；
 * - QDII：海外结算链路长，T+2 确认；
 * - FOF：需等子基金确认，T+2 确认；
 * 无类型信息时由调用方退化到兜底 T+1。
 */
export function defaultConfirmLagDays(type: FundType): number {
  switch (type) {
    case 'QDII':
      return 2;
    case 'FOF':
      return 2;
    default:
      return 1;
  }
}

/** 按基金类型推断赎回资金到账滞后交易日数（T+N 到账）。QDII/FOF 更久。 */
export function defaultSettleLagDays(type: FundType): number {
  switch (type) {
    case 'QDII':
      return 3;
    case 'FOF':
      return 2;
    case 'MONEY':
      return 1;
    default:
      return 1;
  }
}
