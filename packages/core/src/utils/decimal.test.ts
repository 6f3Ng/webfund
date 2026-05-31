import { describe, it, expect } from 'vitest';
import { round, roundAmount, roundShares, sumAmount, approxEqual, clamp } from './decimal';

describe('decimal', () => {
  it('round 处理浮点边界', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(2.675, 2)).toBe(2.68);
    expect(round(0.1 + 0.2, 2)).toBe(0.3);
    expect(round(-1.005, 2)).toBe(-1.01);
  });

  it('roundAmount 保留 2 位', () => {
    expect(roundAmount(100 / 3)).toBe(33.33);
    expect(roundAmount(99.999)).toBe(100);
  });

  it('roundShares 保留 4 位', () => {
    expect(roundShares(1000 / 1.2345)).toBe(810.0446);
  });

  it('sumAmount 求和后规整', () => {
    expect(sumAmount(0.1, 0.2, 0.3)).toBe(0.6);
  });

  it('approxEqual', () => {
    expect(approxEqual(1.001, 1.004)).toBe(true);
    expect(approxEqual(1.001, 1.02)).toBe(false);
  });

  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
