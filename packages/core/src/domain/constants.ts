/** Schema 版本号（用于序列化与迁移） */
export const PORTFOLIO_SCHEMA_VERSION = 1;
export const STRATEGY_SET_SCHEMA_VERSION = 1;

/** 精度约定 */
export const PRECISION = {
  /** 金额保留小数位（元） */
  AMOUNT: 2,
  /** 份额保留小数位 */
  SHARES: 4,
  /** 净值小数位（展示用，计算不强制截断） */
  NAV: 4,
  /** 比率/百分比中间计算位 */
  RATE: 8,
} as const;

/** 申购费扣除方式 */
export type FeeDeductMode = 'EXTERNAL' | 'INTERNAL';

/** 交易申报的净值切换时间（场外基金：15:00 前算当日） */
export const NAV_CUTOFF_HOUR = 15;
export const NAV_CUTOFF_MINUTE = 0;
