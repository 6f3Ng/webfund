import {
  createDefaultFundInfo,
  defaultConfirmLagDays,
  defaultSettleLagDays,
  detectShareClass,
  type FundInfo,
  type FundInfoProvider,
  type FundType,
  type ShareClass,
} from '@fund/core';
import { fetchFundInfo } from '@/api/funds';

/** 基金信息缓存（名称、类型等）；费率使用默认配置（费率接口不稳定，采用统一默认）。 */
const cache = new Map<string, FundInfo>();
/** 基金份额类别缓存（A/C/UNKNOWN），用于按设置区分申购费率。 */
const shareClassCache = new Map<string, ShareClass>();
/** 进行中的 fund-info 预取（按 code 去重，避免同一基金被多处并发重复请求）。 */
const inflight = new Map<string, Promise<FundInfo>>();

/** A/C 类申购费率（由 settingsStore 注册，避免核心服务直接依赖 store 造成循环依赖）。 */
let purchaseFeeRates: { a: number; c: number } = { a: 0.015, c: 0 };

/** A/C 类赎回费率（由 settingsStore 注册）。 */
let redeemFeeRates: { a: number; c: number } = { a: 0.005, c: 0.005 };

/** 注册当前 A/C 类申购费率（settingsStore 初始化与更新时调用）。 */
export function setPurchaseFeeRates(rates: { a: number; c: number }): void {
  purchaseFeeRates = rates;
}

/** 注册当前 A/C 类赎回费率（settingsStore 初始化与更新时调用）。 */
export function setRedeemFeeRates(rates: { a: number; c: number }): void {
  redeemFeeRates = rates;
}

/**
 * 将数据源返回的基金分类文案映射为核心库 FundType。
 * 数据源（天天基金搜索接口）的 CATEGORYDESC 多为中文分类，如「QDII」「混合型」「债券型」等。
 * 无法识别时回退 OTHER（确认/到账按普通基金 T+1 兜底）。
 */
export function mapFundType(typeText?: string): FundType {
  if (!typeText) return 'OTHER';
  const t = typeText.toUpperCase();
  if (t.includes('QDII')) return 'QDII';
  if (t.includes('FOF')) return 'FOF';
  if (typeText.includes('货币')) return 'MONEY';
  if (typeText.includes('指数') || t.includes('ETF') || t.includes('LOF')) return 'INDEX';
  if (typeText.includes('债')) return 'BOND';
  if (typeText.includes('股票')) return 'EQUITY';
  if (typeText.includes('混合')) return 'HYBRID';
  return 'OTHER';
}

/** 按份额类别取申购费率：C 类用 C 费率，A 类/未知用 A 费率。 */
function purchaseFeeFor(shareClass: ShareClass): number {
  return shareClass === 'C' ? purchaseFeeRates.c : purchaseFeeRates.a;
}

/** 按份额类别取赎回费率：C 类用 C 费率，A 类/未知用 A 费率。 */
function redeemFeeFor(shareClass: ShareClass): number {
  return shareClass === 'C' ? redeemFeeRates.c : redeemFeeRates.a;
}

/** 异步预取并缓存基金信息（补充名称与类型，并据类型推断确认/到账滞后、据份额类别定申购费）。
 *  同一 code 的并发调用复用同一请求（in-flight 去重），避免重复打到第三方接口。 */
export async function prefetchFundInfo(code: string): Promise<FundInfo> {
  const cached = cache.get(code);
  if (cached) return cached;
  const pending = inflight.get(code);
  if (pending) return pending;

  const task = (async () => {
    const info = createDefaultFundInfo(code);
    try {
      const remote = await fetchFundInfo(code);
      info.name = remote.name || code;
      const type = mapFundType(remote.type);
      info.type = type;
      // 据类型刷新确认/到账滞后（QDII/FOF 等更久；无类型信息时兜底 T+1）
      info.confirmLagDays = defaultConfirmLagDays(type);
      info.settleLagDays = defaultSettleLagDays(type);
      // 据名称识别 A/C 份额类别，记录用于申购费率解析
      shareClassCache.set(code, detectShareClass(info.name));
    } catch {
      // 忽略，使用默认（OTHER / T+1）
    }
    cache.set(code, info);
    return info;
  })();

  inflight.set(code, task);
  try {
    return await task;
  } finally {
    inflight.delete(code);
  }
}

/**
 * 同步 FundInfoProvider（供交易引擎结算使用）：返回缓存信息，
 * 并按「份额类别 + 当前设置」解析申购费率与赎回费率（A 类 / C 类）。
 * 赎回费采用与申购费一致的统一费率口径（单档 minHoldDays=0，不按持有天数分档）。
 * 未缓存时返回默认配置。
 */
export const fundInfoProvider: FundInfoProvider = (code) => {
  const base = cache.get(code) ?? createDefaultFundInfo(code);
  const shareClass = shareClassCache.get(code) ?? detectShareClass(base.name);
  return {
    ...base,
    purchaseFeeRate: purchaseFeeFor(shareClass),
    redeemFeeTiers: [{ minHoldDays: 0, rate: redeemFeeFor(shareClass) }],
  };
};

/** 取已缓存的基金名称 */
export function getCachedFundName(code: string): string | undefined {
  return cache.get(code)?.name;
}

/** 取已缓存的份额确认滞后交易日数（无缓存时兜底 T+1）。 */
export function getConfirmLagDays(code: string): number {
  return cache.get(code)?.confirmLagDays ?? 1;
}

/** 取基金份额类别（A/C/UNKNOWN）；未缓存时按名称即时识别。 */
export function getShareClass(code: string): ShareClass {
  return shareClassCache.get(code) ?? detectShareClass(cache.get(code)?.name);
}
