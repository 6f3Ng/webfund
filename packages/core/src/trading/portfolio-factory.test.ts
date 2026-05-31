import { describe, it, expect } from 'vitest';
import { createPortfolio, getOrCreatePosition, pruneEmptyPositions } from './portfolio-factory';
import { createStrategySet } from '../strategy/factory';
import { PORTFOLIO_SCHEMA_VERSION, STRATEGY_SET_SCHEMA_VERSION } from '../domain/constants';

describe('createPortfolio', () => {
  it('初始化字段正确', () => {
    const pf = createPortfolio({ name: 'A', initialCash: 100000 });
    expect(pf.name).toBe('A');
    expect(pf.initialCash).toBe(100000);
    expect(pf.cash).toBe(100000);
    expect(pf.schemaVersion).toBe(PORTFOLIO_SCHEMA_VERSION);
    expect(pf.positions).toEqual([]);
    expect(pf.pendingOrders).toEqual([]);
    expect(pf.pendingCash).toEqual([]);
    expect(pf.pendingShares).toEqual([]);
    expect(pf.id).toMatch(/^pf_/);
  });

  it('负初始资金抛错', () => {
    expect(() => createPortfolio({ name: 'A', initialCash: -1 })).toThrow();
  });

  it('金额规整到 2 位', () => {
    const pf = createPortfolio({ name: 'A', initialCash: 100.005 });
    expect(pf.initialCash).toBe(100.01);
  });

  it('配置现有持仓：成本计入初始总投入，份额可卖', () => {
    const pf = createPortfolio({
      name: 'A',
      initialCash: 50000,
      positions: [
        { fundCode: '000001', shares: 1000, costPrice: 2, acquiredDate: '2024-01-01' },
        { fundCode: '110011', shares: 500, costPrice: 6 },
      ],
    });
    // 可用现金保持输入值
    expect(pf.cash).toBe(50000);
    // 初始总投入 = 现金 + 持仓成本(1000*2 + 500*6 = 2000+3000)
    expect(pf.initialCash).toBe(55000);
    expect(pf.positions).toHaveLength(2);
    const p1 = pf.positions[0];
    expect(p1.shares).toBe(1000);
    expect(p1.availableShares).toBe(1000); // 现有持仓视为已到账可卖
    expect(p1.cost).toBe(2000);
    expect(p1.lots[0]).toEqual({ acquiredDate: '2024-01-01', shares: 1000, nav: 2 });
  });

  it('成本单价精确到 4 位，总成本由份额×单价推导', () => {
    const pf = createPortfolio({
      name: 'A',
      initialCash: 0,
      positions: [{ fundCode: '000001', shares: 5000, costPrice: 1.30005 }],
    });
    const p = pf.positions[0];
    // 单价四舍五入到 4 位 = 1.3001（1.30005 + epsilon 进位 → 1.3001）
    expect(p.lots[0].nav).toBeCloseTo(1.3001, 4);
    // 总成本 = 5000 * 1.3001 = 6500.50
    expect(p.cost).toBe(6500.5);
    expect(pf.initialCash).toBe(6500.5);
  });

  it('忽略份额为 0 的持仓项', () => {
    const pf = createPortfolio({
      name: 'A',
      initialCash: 1000,
      positions: [{ fundCode: '000001', shares: 0, costPrice: 1 }],
    });
    expect(pf.positions).toHaveLength(0);
  });
});

describe('getOrCreatePosition', () => {
  it('不存在则创建，存在则复用', () => {
    const pf = createPortfolio({ name: 'A', initialCash: 1000 });
    const p1 = getOrCreatePosition(pf, '000001');
    expect(pf.positions).toHaveLength(1);
    const p2 = getOrCreatePosition(pf, '000001');
    expect(p1).toBe(p2);
    expect(pf.positions).toHaveLength(1);
  });
});

describe('pruneEmptyPositions', () => {
  it('移除份额为 0 的持仓', () => {
    const pf = createPortfolio({ name: 'A', initialCash: 1000 });
    getOrCreatePosition(pf, '000001'); // shares 0
    const p2 = getOrCreatePosition(pf, '000002');
    p2.shares = 100;
    pruneEmptyPositions(pf);
    expect(pf.positions).toHaveLength(1);
    expect(pf.positions[0].fundCode).toBe('000002');
  });
});

describe('createStrategySet', () => {
  it('初始化字段正确', () => {
    const s = createStrategySet({ name: '集合A' });
    expect(s.name).toBe('集合A');
    expect(s.schemaVersion).toBe(STRATEGY_SET_SCHEMA_VERSION);
    expect(s.strategies).toEqual([]);
    expect(s.conflictPolicy.sellBeforeBuy).toBe(true);
    expect(s.conflictPolicy.mergeSameDirection).toBe(true);
    expect(s.id).toMatch(/^ss_/);
  });
});
