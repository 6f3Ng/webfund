import { describe, it, expect } from 'vitest';
import type { NavPoint, Strategy } from '../domain';
import { DEFAULT_CONFLICT_POLICY } from '../domain';
import { previewLiveExecution, buildLiveDayContext, type LiveExecInput } from './live';

/** 构造一段升序净值（含今日点） */
function navSeries(dates: string[], navs: number[]): NavPoint[] {
  return dates.map((date, i) => ({ date, nav: navs[i] }));
}

const TODAY = '2024-06-03';

function makeInput(partial: Partial<LiveExecInput>): LiveExecInput {
  return {
    date: TODAY,
    strategies: [],
    navData: {},
    positions: {},
    cash: 100000,
    conflictPolicy: DEFAULT_CONFLICT_POLICY,
    ...partial,
  };
}

describe('previewLiveExecution', () => {
  it('定投策略手动执行立即触发一次买入', () => {
    const strategy: Strategy = {
      id: 's1',
      name: '月定投',
      templateType: 'DCA',
      fundCode: '000001',
      params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: 1, amount: 2000 },
      enabled: true,
    };
    const res = previewLiveExecution(
      makeInput({
        strategies: [strategy],
        navData: { '000001': navSeries(['2024-06-01', '2024-06-02', TODAY], [1.0, 1.01, 1.02]) },
      }),
    );
    expect(res.merged).toHaveLength(1);
    expect(res.merged[0]).toMatchObject({ fundCode: '000001', side: 'BUY', amount: 2000 });
    expect(res.diagnostics[0].triggered).toBe(true);
  });

  it('阈值买入：近窗口跌幅达标时按估值推算触发买入', () => {
    const strategy: Strategy = {
      id: 's2',
      name: '跌买',
      templateType: 'THRESHOLD_BUY',
      fundCode: '161725',
      params: { type: 'THRESHOLD_BUY', dropPct: 0.05, window: 2, amount: 3000 },
      enabled: true,
    };
    // 今日相对 2 个交易日前跌 10%（1.0 → 0.9）
    const res = previewLiveExecution(
      makeInput({
        strategies: [strategy],
        navData: { '161725': navSeries(['2024-05-30', '2024-05-31', TODAY], [1.0, 0.95, 0.9]) },
      }),
    );
    expect(res.merged).toHaveLength(1);
    expect(res.merged[0]).toMatchObject({ side: 'BUY', amount: 3000 });
  });

  it('阈值买入：跌幅不足不触发', () => {
    const strategy: Strategy = {
      id: 's3',
      name: '跌买',
      templateType: 'THRESHOLD_BUY',
      fundCode: '161725',
      params: { type: 'THRESHOLD_BUY', dropPct: 0.2, window: 2, amount: 3000 },
      enabled: true,
    };
    const res = previewLiveExecution(
      makeInput({
        strategies: [strategy],
        navData: { '161725': navSeries(['2024-05-30', '2024-05-31', TODAY], [1.0, 0.98, 0.97]) },
      }),
    );
    expect(res.merged).toHaveLength(0);
    expect(res.diagnostics[0].triggered).toBe(false);
  });

  it('止盈：依据当前估值与成本求收益率触发按比例卖出', () => {
    const strategy: Strategy = {
      id: 's4',
      name: '止盈',
      templateType: 'TAKE_PROFIT',
      fundCode: '000001',
      params: { type: 'TAKE_PROFIT', gainPct: 0.2, sellRatio: 0.5 },
      enabled: true,
    };
    // 持仓平均成本 1.0，今日估值 1.3 → 收益率 30% ≥ 20%
    const res = previewLiveExecution(
      makeInput({
        strategies: [strategy],
        navData: { '000001': navSeries([TODAY], [1.3]) },
        positions: { '000001': { shares: 1000, cost: 1000 } },
      }),
    );
    expect(res.merged).toHaveLength(1);
    expect(res.merged[0]).toMatchObject({ side: 'SELL', ratio: 0.5 });
  });

  it('禁用的策略不参与求值', () => {
    const strategy: Strategy = {
      id: 's5',
      name: '停用定投',
      templateType: 'DCA',
      fundCode: '000001',
      params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: 1, amount: 2000 },
      enabled: false,
    };
    const res = previewLiveExecution(
      makeInput({
        strategies: [strategy],
        navData: { '000001': navSeries([TODAY], [1.0]) },
      }),
    );
    expect(res.merged).toHaveLength(0);
    expect(res.diagnostics[0].triggered).toBe(false);
  });

  it('冲突归并：同标的既买又卖按策略集策略先卖后买', () => {
    const buy: Strategy = {
      id: 'b',
      name: '定投',
      templateType: 'DCA',
      fundCode: '000001',
      params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: 1, amount: 2000 },
      enabled: true,
    };
    const sell: Strategy = {
      id: 's',
      name: '止盈',
      templateType: 'TAKE_PROFIT',
      fundCode: '000001',
      params: { type: 'TAKE_PROFIT', gainPct: 0.1, sellRatio: 0.3 },
      enabled: true,
    };
    const res = previewLiveExecution(
      makeInput({
        strategies: [buy, sell],
        navData: { '000001': navSeries(['2024-06-01', TODAY], [1.0, 1.3]) },
        positions: { '000001': { shares: 1000, cost: 1000 } },
      }),
    );
    // 先卖后买
    expect(res.merged[0].side).toBe('SELL');
    expect(res.merged[1].side).toBe('BUY');
  });

  it('底仓策略：未建仓时触发一次建仓；已记录则不再触发（避免重复买入）', () => {
    const base: Strategy = {
      id: 'base1',
      name: '建底仓',
      templateType: 'BASE_POSITION',
      fundCode: '161725',
      params: { type: 'BASE_POSITION', amount: 50000 },
      enabled: true,
    };
    const navData = { '161725': navSeries([TODAY], [1.0]) };

    // 未记录 → 触发建仓
    const r1 = previewLiveExecution(makeInput({ strategies: [base], navData }));
    expect(r1.merged).toHaveLength(1);
    expect(r1.merged[0]).toMatchObject({ side: 'BUY', amount: 50000 });
    expect(r1.diagnostics[0].triggered).toBe(true);

    // 已记录该底仓策略 id → 本次不再触发，并标记 baseAlreadyBuilt
    const r2 = previewLiveExecution(
      makeInput({ strategies: [base], navData, executedBaseStrategyIds: ['base1'] }),
    );
    expect(r2.merged).toHaveLength(0);
    expect(r2.diagnostics[0].triggered).toBe(false);
    expect(r2.diagnostics[0].baseAlreadyBuilt).toBe(true);
  });

  it('多策略组底仓互不影响：各自按 id 独立建仓一次', () => {
    const baseA: Strategy = {
      id: 'baseA',
      name: 'A组底仓',
      templateType: 'BASE_POSITION',
      fundCode: '161725',
      params: { type: 'BASE_POSITION', amount: 30000 },
      enabled: true,
    };
    const baseB: Strategy = {
      id: 'baseB',
      name: 'B组底仓',
      templateType: 'BASE_POSITION',
      fundCode: '000001',
      params: { type: 'BASE_POSITION', amount: 20000 },
      enabled: true,
    };
    const navData = { '161725': navSeries([TODAY], [1.0]), '000001': navSeries([TODAY], [2.0]) };

    // A 组已建仓，B 组未建 → 仅 B 组触发
    const res = previewLiveExecution(
      makeInput({ strategies: [baseA, baseB], navData, executedBaseStrategyIds: ['baseA'] }),
    );
    expect(res.merged).toHaveLength(1);
    expect(res.merged[0]).toMatchObject({ fundCode: '000001', side: 'BUY', amount: 20000 });
    expect(res.diagnostics.find((d) => d.strategyId === 'baseA')?.baseAlreadyBuilt).toBe(true);
    expect(res.diagnostics.find((d) => d.strategyId === 'baseB')?.triggered).toBe(true);
  });

  it('buildLiveDayContext: navTradingDaysAgo 以今日为基准回看', () => {
    const ctx = buildLiveDayContext(
      makeInput({
        strategies: [
          {
            id: 'x',
            name: 'x',
            templateType: 'DCA',
            fundCode: '000001',
            params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: 1, amount: 1 },
            enabled: true,
          },
        ],
        navData: { '000001': navSeries(['2024-05-30', '2024-05-31', TODAY], [1.0, 1.1, 1.2]) },
      }),
    );
    expect(ctx.navToday('000001')).toBe(1.2);
    expect(ctx.navTradingDaysAgo('000001', 1)).toBe(1.1);
    expect(ctx.navTradingDaysAgo('000001', 2)).toBe(1.0);
    expect(ctx.navTradingDaysAgo('000001', 3)).toBeUndefined();
  });
});
