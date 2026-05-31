import type { FeeDeductMode } from '../domain/constants';
import type { RedeemFeeTier, ShareLot } from '../domain';
import { diffDays } from '../utils/date';
import { roundAmount, roundShares } from '../utils/decimal';

/**
 * 申购费计算。
 * - EXTERNAL（外扣，默认）：净申购 = 金额 / (1 + 费率)，费用 = 金额 - 净申购。
 * - INTERNAL（内扣）：费用 = 金额 * 费率，净申购 = 金额 - 费用。
 */
export function calcPurchase(
  amount: number,
  feeRate: number,
  nav: number,
  mode: FeeDeductMode = 'EXTERNAL',
): { netAmount: number; fee: number; shares: number } {
  if (amount <= 0) throw new Error('申购金额必须大于 0');
  if (nav <= 0) throw new Error('净值必须大于 0');

  let netAmount: number;
  let fee: number;
  if (mode === 'EXTERNAL') {
    netAmount = roundAmount(amount / (1 + feeRate));
    fee = roundAmount(amount - netAmount);
  } else {
    fee = roundAmount(amount * feeRate);
    netAmount = roundAmount(amount - fee);
  }
  const shares = roundShares(netAmount / nav);
  return { netAmount, fee, shares };
}

/** 根据持有天数匹配赎回费率（取满足 minHoldDays<=holdDays 的最大档） */
export function matchRedeemFeeRate(tiers: RedeemFeeTier[], holdDays: number): number {
  const sorted = [...tiers].sort((a, b) => a.minHoldDays - b.minHoldDays);
  let rate = sorted.length > 0 ? sorted[0].rate : 0;
  for (const t of sorted) {
    if (holdDays >= t.minHoldDays) rate = t.rate;
  }
  return rate;
}

/**
 * 赎回计算：按 FIFO 从 lots 中扣减 shares，逐批次按持有天数匹配赎回费率，加权求费。
 * @returns 赎回毛额、费用、净到手金额、各批次明细、扣减后剩余 lots
 */
export function calcRedeem(
  lots: ShareLot[],
  redeemShares: number,
  nav: number,
  tiers: RedeemFeeTier[],
  redeemDate: string,
): {
  grossAmount: number;
  fee: number;
  netAmount: number;
  remainingLots: ShareLot[];
  consumed: { shares: number; holdDays: number; rate: number }[];
} {
  if (redeemShares <= 0) throw new Error('赎回份额必须大于 0');
  if (nav <= 0) throw new Error('净值必须大于 0');

  const totalShares = lots.reduce((acc, l) => acc + l.shares, 0);
  if (roundShares(redeemShares) > roundShares(totalShares)) {
    throw new Error(`赎回份额 ${redeemShares} 超过持有份额 ${totalShares}`);
  }

  const remaining: ShareLot[] = lots.map((l) => ({ ...l }));
  const consumed: { shares: number; holdDays: number; rate: number }[] = [];
  let toRedeem = redeemShares;
  let fee = 0;
  let gross = 0;

  for (const lot of remaining) {
    if (toRedeem <= 0) break;
    const take = Math.min(lot.shares, toRedeem);
    if (take <= 0) continue;
    const holdDays = Math.max(0, diffDays(lot.acquiredDate, redeemDate));
    const rate = matchRedeemFeeRate(tiers, holdDays);
    const lotGross = take * nav;
    gross += lotGross;
    fee += lotGross * rate;
    consumed.push({ shares: roundShares(take), holdDays, rate });
    lot.shares = roundShares(lot.shares - take);
    toRedeem = roundShares(toRedeem - take);
  }

  const remainingLots = remaining.filter((l) => l.shares > 0);
  const grossAmount = roundAmount(gross);
  const feeAmount = roundAmount(fee);
  const netAmount = roundAmount(grossAmount - feeAmount);
  return { grossAmount, fee: feeAmount, netAmount, remainingLots, consumed };
}

/**
 * 转换费计算（简化为单一转换费率，按转出市值收取）。
 * @returns 转出毛额、费用、可用于申购目标基金的净额
 */
export function calcConvertOut(
  shares: number,
  sourceNav: number,
  convertFeeRate: number,
): { grossAmount: number; fee: number; netAmount: number } {
  if (shares <= 0) throw new Error('转换份额必须大于 0');
  if (sourceNav <= 0) throw new Error('净值必须大于 0');
  const grossAmount = roundAmount(shares * sourceNav);
  const fee = roundAmount(grossAmount * convertFeeRate);
  const netAmount = roundAmount(grossAmount - fee);
  return { grossAmount, fee, netAmount };
}

/** 已知净额与目标净值，计算转入份额 */
export function calcConvertInShares(netAmount: number, targetNav: number): number {
  if (targetNav <= 0) throw new Error('净值必须大于 0');
  return roundShares(netAmount / targetNav);
}
