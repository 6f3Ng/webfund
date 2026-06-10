import { describe, it, expect } from 'vitest';
import type { Portfolio } from '@fund/core';
import { mergePortfolioPositions } from './portfolioStore';

/** 构造最小可用的持仓集合对象（仅 merge 关心的字段） */
function makePortfolio(
  positions: { fundCode: string; shares: number; cost: number; acquiredDate: string }[],
): Portfolio {
  return {
    id: 'pf_test',
    name: 'test',
    schemaVersion: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    initialCash: 0,
    cash: 0,
    positions: positions.map((p) => ({
      fundCode: p.fundCode,
      shares: p.shares,
      availableShares: p.shares,
      cost: p.cost,
      lots: [{ acquiredDate: p.acquiredDate, shares: p.shares, nav: p.cost / p.shares }],
    })),
    transactions: [],
    pendingOrders: [],
    pendingCash: [],
    pendingShares: [],
    settings: {},
  } as Portfolio;
}

describe('mergePortfolioPositions', () => {
  it('同基金按份额合并、成本加权平均、取最早买入日期', () => {
    const a = makePortfolio([{ fundCode: '161725', shares: 1000, cost: 1300, acquiredDate: '2023-05-01' }]);
    const b = makePortfolio([{ fundCode: '161725', shares: 500, cost: 800, acquiredDate: '2023-01-10' }]);

    const merged = mergePortfolioPositions([a, b]);
    expect(merged).toHaveLength(1);
    const p = merged[0];
    expect(p.fundCode).toBe('161725');
    expect(p.shares).toBe(1500);
    // 成本单价 = (1300 + 800) / 1500
    expect(p.costPrice).toBeCloseTo(2100 / 1500, 6);
    // 取较早的买入日期
    expect(p.acquiredDate).toBe('2023-01-10');
  });

  it('不同基金各自保留，份额为 0 的持仓被忽略', () => {
    const a = makePortfolio([
      { fundCode: '161725', shares: 1000, cost: 1300, acquiredDate: '2023-05-01' },
      { fundCode: '000001', shares: 0, cost: 0, acquiredDate: '2023-05-01' },
    ]);
    const b = makePortfolio([{ fundCode: '110011', shares: 200, cost: 900, acquiredDate: '2023-06-01' }]);

    const merged = mergePortfolioPositions([a, b]);
    const codes = merged.map((p) => p.fundCode).sort();
    expect(codes).toEqual(['110011', '161725']);
  });

  it('空集合合并得到空持仓', () => {
    expect(mergePortfolioPositions([makePortfolio([]), makePortfolio([])])).toEqual([]);
  });
});
