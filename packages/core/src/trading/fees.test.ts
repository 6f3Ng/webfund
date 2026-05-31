import { describe, it, expect } from 'vitest';
import {
  calcPurchase,
  matchRedeemFeeRate,
  calcRedeem,
  calcConvertOut,
  calcConvertInShares,
} from './fees';
import { DEFAULT_REDEEM_FEE_TIERS } from '../domain';
import type { ShareLot } from '../domain';

describe('calcPurchase', () => {
  it('外扣费率（默认）', () => {
    // 金额 10000, 费率 1.5%, 净值 2.0
    // 净申购 = 10000 / 1.015 = 9852.22, 费 = 147.78, 份额 = 9852.22 / 2 = 4926.11
    const r = calcPurchase(10000, 0.015, 2.0, 'EXTERNAL');
    expect(r.netAmount).toBe(9852.22);
    expect(r.fee).toBe(147.78);
    expect(r.shares).toBe(4926.11);
  });

  it('内扣费率', () => {
    const r = calcPurchase(10000, 0.015, 2.0, 'INTERNAL');
    expect(r.fee).toBe(150);
    expect(r.netAmount).toBe(9850);
    expect(r.shares).toBe(4925);
  });

  it('零费率', () => {
    const r = calcPurchase(10000, 0, 2.0);
    expect(r.fee).toBe(0);
    expect(r.netAmount).toBe(10000);
    expect(r.shares).toBe(5000);
  });

  it('非法参数抛错', () => {
    expect(() => calcPurchase(0, 0.015, 2)).toThrow();
    expect(() => calcPurchase(100, 0.015, 0)).toThrow();
  });
});

describe('matchRedeemFeeRate', () => {
  const tiers = DEFAULT_REDEEM_FEE_TIERS; // [0:1.5%, 7:0.5%, 365:0.25%, 730:0%]

  it('按持有天数匹配档位', () => {
    expect(matchRedeemFeeRate(tiers, 0)).toBe(0.015);
    expect(matchRedeemFeeRate(tiers, 6)).toBe(0.015);
    expect(matchRedeemFeeRate(tiers, 7)).toBe(0.005);
    expect(matchRedeemFeeRate(tiers, 364)).toBe(0.005);
    expect(matchRedeemFeeRate(tiers, 365)).toBe(0.0025);
    expect(matchRedeemFeeRate(tiers, 730)).toBe(0);
    expect(matchRedeemFeeRate(tiers, 1000)).toBe(0);
  });
});

describe('calcRedeem', () => {
  it('单批次赎回，按持有天数取费率', () => {
    const lots: ShareLot[] = [{ acquiredDate: '2024-01-01', shares: 1000, nav: 1.0 }];
    // 持有到 2024-01-05 = 4 天 → 1.5%; 净值 1.2
    const r = calcRedeem(lots, 1000, 1.2, DEFAULT_REDEEM_FEE_TIERS, '2024-01-05');
    expect(r.grossAmount).toBe(1200);
    expect(r.fee).toBe(18); // 1200 * 1.5%
    expect(r.netAmount).toBe(1182);
    expect(r.remainingLots).toHaveLength(0);
  });

  it('多批次 FIFO，不同持有天数适用不同费率', () => {
    const lots: ShareLot[] = [
      { acquiredDate: '2024-01-01', shares: 500, nav: 1.0 }, // 老批次，持有久
      { acquiredDate: '2024-06-01', shares: 500, nav: 1.1 }, // 新批次
    ];
    // 赎回 800 份 于 2024-06-05
    // 批次1: 500份, 持有 156 天 → 0.5%; 批次2: 300份, 持有 4 天 → 1.5%
    // 净值 1.2: gross = 800*1.2 = 960
    // fee = 500*1.2*0.005 + 300*1.2*0.015 = 3 + 5.4 = 8.4
    const r = calcRedeem(lots, 800, 1.2, DEFAULT_REDEEM_FEE_TIERS, '2024-06-05');
    expect(r.grossAmount).toBe(960);
    expect(r.fee).toBe(8.4);
    expect(r.netAmount).toBe(951.6);
    expect(r.remainingLots).toHaveLength(1);
    expect(r.remainingLots[0].shares).toBe(200); // 批次2 剩 200
    expect(r.consumed).toHaveLength(2);
  });

  it('赎回超过持有份额抛错', () => {
    const lots: ShareLot[] = [{ acquiredDate: '2024-01-01', shares: 100, nav: 1 }];
    expect(() => calcRedeem(lots, 200, 1, DEFAULT_REDEEM_FEE_TIERS, '2024-01-02')).toThrow();
  });
});

describe('convert', () => {
  it('calcConvertOut 收转换费', () => {
    // 1000 份 * 净值 2.0 = 2000, 费率 0.5% → 费 10, 净额 1990
    const r = calcConvertOut(1000, 2.0, 0.005);
    expect(r.grossAmount).toBe(2000);
    expect(r.fee).toBe(10);
    expect(r.netAmount).toBe(1990);
  });

  it('calcConvertInShares', () => {
    expect(calcConvertInShares(1990, 1.5)).toBe(1326.6667);
  });
});
