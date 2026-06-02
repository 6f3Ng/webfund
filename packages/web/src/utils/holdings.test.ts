import { describe, it, expect } from 'vitest';
import type { PortfolioSnapshot, Position } from '@fund/core';
import {
  columnValueGetters,
  dayProfitValue,
  resolveDisplayName,
  sortByValue,
  type HoldingsSortContext,
} from './holdings';

function pos(fundCode: string, over: Partial<Position> = {}): Position {
  return { fundCode, shares: 100, availableShares: 100, cost: 100, lots: [], ...over };
}

function snapWith(items: { fundCode: string; dayProfit: number; profit: number }[]): PortfolioSnapshot {
  return {
    marketValue: 0,
    cash: 0,
    pendingCash: 0,
    totalAssets: 0,
    totalProfit: 0,
    totalProfitRate: 0,
    dayProfit: 0,
    positions: items.map((it) => ({
      fundCode: it.fundCode,
      shares: 100,
      availableShares: 100,
      cost: 100,
      nav: 1,
      marketValue: 100,
      profit: it.profit,
      profitRate: 0,
      dayProfit: it.dayProfit,
    })),
  };
}

describe('holdings dayProfit（估算收益）取值', () => {
  it('有快照时返回该持仓 dayProfit', () => {
    const ctx: HoldingsSortContext = {
      quotes: {},
      snap: snapWith([{ fundCode: '000001', dayProfit: 12.34, profit: 50 }]),
    };
    expect(dayProfitValue(pos('000001'), ctx)).toBe(12.34);
    expect(columnValueGetters.dayProfit(pos('000001'), ctx)).toBe(12.34);
  });

  it('无快照时返回 -Infinity（缺失值确定性聚集）', () => {
    const ctx: HoldingsSortContext = { quotes: {}, snap: null };
    expect(dayProfitValue(pos('000001'), ctx)).toBe(-Infinity);
  });

  it('按估算收益排序：缺失值聚集一端、有值升序', () => {
    const ctx: HoldingsSortContext = {
      quotes: {},
      snap: snapWith([
        { fundCode: 'A', dayProfit: 5, profit: 0 },
        { fundCode: 'B', dayProfit: -3, profit: 0 },
      ]),
    };
    const rows = [pos('A'), pos('B'), pos('C')]; // C 无快照
    const cmp = sortByValue((r) => columnValueGetters.dayProfit(r, ctx));
    const sorted = [...rows].sort(cmp).map((r) => r.fundCode);
    // 缺失(C) 在最前，其余升序 B(-3) < A(5)
    expect(sorted).toEqual(['C', 'B', 'A']);
  });
});

describe('resolveDisplayName', () => {
  it('优先本地名称表，其次缓存，最后回退代码', () => {
    expect(resolveDisplayName('000001', { '000001': '华夏成长' }, () => undefined)).toBe('华夏成长');
    expect(resolveDisplayName('000001', {}, (c) => (c === '000001' ? '缓存名' : undefined))).toBe('缓存名');
    expect(resolveDisplayName('000001', {}, () => undefined)).toBe('000001');
  });
});
