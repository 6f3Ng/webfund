import { describe, it, expect } from 'vitest';
import { defaultConfirmLagDays } from '@fund/core';
import { mapFundType, setPurchaseFeeRates, setRedeemFeeRates, fundInfoProvider } from './fundInfoService';

describe('mapFundType（数据源分类 → FundType）', () => {
  it('识别 QDII / FOF（确认期更久）', () => {
    expect(mapFundType('QDII')).toBe('QDII');
    expect(mapFundType('QDII-指数')).toBe('QDII');
    expect(mapFundType('FOF')).toBe('FOF');
    // 据类型推断确认滞后：QDII/FOF = T+2
    expect(defaultConfirmLagDays(mapFundType('QDII'))).toBe(2);
    expect(defaultConfirmLagDays(mapFundType('FOF'))).toBe(2);
  });

  it('识别常见中文分类', () => {
    expect(mapFundType('货币型')).toBe('MONEY');
    expect(mapFundType('指数型')).toBe('INDEX');
    expect(mapFundType('债券型')).toBe('BOND');
    expect(mapFundType('股票型')).toBe('EQUITY');
    expect(mapFundType('混合型')).toBe('HYBRID');
  });

  it('未知/缺失回退 OTHER（兜底 T+1）', () => {
    expect(mapFundType(undefined)).toBe('OTHER');
    expect(mapFundType('某种新类型')).toBe('OTHER');
    expect(defaultConfirmLagDays(mapFundType(undefined))).toBe(1);
  });
});

describe('fundInfoProvider 申购费率按份额类别解析', () => {
  it('未缓存基金按名称类别回退默认 A 费率', () => {
    setPurchaseFeeRates({ a: 0.015, c: 0 });
    // 未预取的代码，无名称 → UNKNOWN → A 费率
    expect(fundInfoProvider('999999').purchaseFeeRate).toBe(0.015);
  });

  it('设置变更后费率即时生效（A 类）', () => {
    setPurchaseFeeRates({ a: 0.012, c: 0.001 });
    expect(fundInfoProvider('999999').purchaseFeeRate).toBe(0.012);
    // 还原默认，避免影响其它用例
    setPurchaseFeeRates({ a: 0.015, c: 0 });
  });
});

describe('fundInfoProvider 赎回费率按份额类别解析（单档统一费率）', () => {
  it('未缓存基金回退默认 A 赎回费率（0.5%），单档 minHoldDays=0', () => {
    setRedeemFeeRates({ a: 0.005, c: 0.005 });
    const info = fundInfoProvider('999999'); // UNKNOWN → A
    expect(info.redeemFeeTiers).toEqual([{ minHoldDays: 0, rate: 0.005 }]);
  });

  it('设置变更后赎回费率即时生效', () => {
    setRedeemFeeRates({ a: 0.003, c: 0.006 });
    expect(fundInfoProvider('999999').redeemFeeTiers[0].rate).toBe(0.003);
    // 还原默认，避免影响其它用例
    setRedeemFeeRates({ a: 0.005, c: 0.005 });
  });
});
