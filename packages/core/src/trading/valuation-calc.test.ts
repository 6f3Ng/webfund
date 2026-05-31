import { describe, it, expect } from 'vitest';
import { snapshotPortfolio } from './valuation-calc';
import { createPortfolio } from './portfolio-factory';

describe('snapshotPortfolio - 初始持仓收益口径', () => {
  it('刚创建（估值未加载）时按成本回退，收益为 0', () => {
    const pf = createPortfolio({
      name: '已有持仓',
      initialCash: 100000,
      positions: [{ fundCode: '000001', shares: 5000, costPrice: 1.3 }],
    });
    // 不提供任何价格 → 应按成本回退，盈亏 0
    const snap = snapshotPortfolio(pf, {});
    // 持仓市值 = 成本 6500；总资产 = 现金 100000 + 6500 = 106500 = 初始基准
    expect(snap.marketValue).toBe(6500);
    expect(snap.totalAssets).toBe(106500);
    expect(snap.totalProfit).toBe(0);
    expect(snap.totalProfitRate).toBe(0);
    expect(snap.positions[0].profit).toBe(0);
    expect(snap.positions[0].profitRate).toBe(0);
  });

  it('部分持仓有估值、部分缺价：缺价按成本回退', () => {
    const pf = createPortfolio({
      name: '混合',
      initialCash: 0,
      positions: [
        { fundCode: '000001', shares: 1000, costPrice: 1.0 }, // 成本 1000
        { fundCode: '110011', shares: 1000, costPrice: 2.0 }, // 成本 2000
      ],
    });
    // 仅 000001 有估值（涨到 1.5），110011 缺价
    const snap = snapshotPortfolio(pf, { '000001': { nav: 1.5 } });
    // 000001 市值 1500（+500），110011 回退成本 2000（0）
    expect(snap.marketValue).toBe(3500);
    expect(snap.totalProfit).toBe(500);
    const p2 = snap.positions.find((p) => p.fundCode === '110011')!;
    expect(p2.profit).toBe(0);
  });

  it('有估值时正常计算盈亏', () => {
    const pf = createPortfolio({
      name: '盈利',
      initialCash: 0,
      positions: [{ fundCode: '000001', shares: 5000, costPrice: 1.3 }],
    });
    // 估值涨到 1.5
    const snap = snapshotPortfolio(pf, { '000001': { nav: 1.5, prevNav: 1.4 } });
    // 市值 7500，成本 6500 → 收益 1000
    expect(snap.marketValue).toBe(7500);
    expect(snap.totalProfit).toBe(1000);
    expect(snap.totalProfitRate).toBeCloseTo(1000 / 6500, 6);
    // 当日盈亏 = 5000 * (1.5 - 1.4) = 500
    expect(snap.dayProfit).toBe(500);
  });
});
