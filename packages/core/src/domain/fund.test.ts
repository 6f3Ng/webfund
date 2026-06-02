import { describe, it, expect } from 'vitest';
import {
  detectShareClass,
  defaultConfirmLagDays,
  defaultSettleLagDays,
  createDefaultFundInfo,
} from './fund';

describe('detectShareClass（A/C 份额类别识别）', () => {
  it('识别名称末尾的 A/C', () => {
    expect(detectShareClass('招商中证白酒指数(LOF)A')).toBe('A');
    expect(detectShareClass('易方达蓝筹精选混合C')).toBe('C');
    expect(detectShareClass('华夏成长混合')).toBe('UNKNOWN');
  });

  it('识别显式 A类/C类、(A)/(C) 标记', () => {
    expect(detectShareClass('某基金A类')).toBe('A');
    expect(detectShareClass('某基金C类')).toBe('C');
    expect(detectShareClass('某基金(C)')).toBe('C');
    expect(detectShareClass('某基金（A）')).toBe('A');
    expect(detectShareClass('某基金C份额')).toBe('C');
  });

  it('空/未知名称回退 UNKNOWN', () => {
    expect(detectShareClass(undefined)).toBe('UNKNOWN');
    expect(detectShareClass('')).toBe('UNKNOWN');
    expect(detectShareClass('某混合型基金')).toBe('UNKNOWN');
  });
});

describe('确认/到账滞后默认值', () => {
  it('QDII/FOF 确认更久（T+2），其余 T+1', () => {
    expect(defaultConfirmLagDays('QDII')).toBe(2);
    expect(defaultConfirmLagDays('FOF')).toBe(2);
    expect(defaultConfirmLagDays('HYBRID')).toBe(1);
    expect(defaultConfirmLagDays('INDEX')).toBe(1);
  });

  it('赎回到账：QDII T+3、FOF T+2、其余 T+1', () => {
    expect(defaultSettleLagDays('QDII')).toBe(3);
    expect(defaultSettleLagDays('FOF')).toBe(2);
    expect(defaultSettleLagDays('EQUITY')).toBe(1);
  });

  it('createDefaultFundInfo 含 confirmLagDays', () => {
    const info = createDefaultFundInfo('513100', 'QDII基金', 'QDII');
    expect(info.confirmLagDays).toBe(2);
    expect(info.settleLagDays).toBe(3);
  });
});
