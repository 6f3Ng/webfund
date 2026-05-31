import { describe, it, expect } from 'vitest';
import { evaluateStrategy, navToGridLevel } from './evaluators';
import type { DayContext, StrategyRuntimeState } from './types';
import type { Strategy, NavPoint } from '../domain';

function ctx(partial: Partial<DayContext> & { date: string }): DayContext {
  return {
    dayIndex: 0,
    cash: 1_000_000,
    navToday: () => 1,
    navTradingDaysAgo: () => undefined,
    navHistory: () => [],
    position: () => undefined,
    ...partial,
  };
}

describe('DCA 定投', () => {
  const s: Strategy = {
    id: 'd1',
    name: '月投',
    templateType: 'DCA',
    fundCode: '000001',
    params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: 5, amount: 1000 },
    enabled: true,
  };

  it('到期日触发买入', () => {
    const state: StrategyRuntimeState = {};
    const actions = evaluateStrategy(s, ctx({ date: '2024-03-05' }), state);
    expect(actions).toHaveLength(1);
    expect(actions[0].side).toBe('BUY');
    expect(actions[0].amount).toBe(1000);
  });

  it('同月不重复投', () => {
    const state: StrategyRuntimeState = {};
    evaluateStrategy(s, ctx({ date: '2024-03-05' }), state);
    const again = evaluateStrategy(s, ctx({ date: '2024-03-06' }), state);
    expect(again).toHaveLength(0);
  });

  it('目标日逢非交易日，过期后补投', () => {
    const state: StrategyRuntimeState = {};
    // 3-05 未出现（假设非交易日），3-06 首次出现且已过 5 号 → 补投
    const actions = evaluateStrategy(s, ctx({ date: '2024-03-06' }), state);
    expect(actions).toHaveLength(1);
  });

  it('现金不足不买', () => {
    const state: StrategyRuntimeState = {};
    const actions = evaluateStrategy(s, ctx({ date: '2024-03-05', cash: 500 }), state);
    expect(actions).toHaveLength(0);
  });

  it('禁用策略不触发', () => {
    const state: StrategyRuntimeState = {};
    const actions = evaluateStrategy({ ...s, enabled: false }, ctx({ date: '2024-03-05' }), state);
    expect(actions).toHaveLength(0);
  });
});

describe('THRESHOLD_BUY 阈值买入', () => {
  const s: Strategy = {
    id: 't1',
    name: '跌5买',
    templateType: 'THRESHOLD_BUY',
    fundCode: '000001',
    params: { type: 'THRESHOLD_BUY', dropPct: 0.05, window: 3, amount: 2000 },
    enabled: true,
  };

  it('跌幅达标触发', () => {
    const state: StrategyRuntimeState = {};
    const actions = evaluateStrategy(
      s,
      ctx({
        date: '2024-03-10',
        dayIndex: 5,
        navToday: () => 0.94,
        navTradingDaysAgo: (_c, n) => (n === 3 ? 1.0 : undefined), // 跌 6%
      }),
      state,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].amount).toBe(2000);
  });

  it('跌幅不足不触发', () => {
    const state: StrategyRuntimeState = {};
    const actions = evaluateStrategy(
      s,
      ctx({
        date: '2024-03-10',
        navToday: () => 0.98,
        navTradingDaysAgo: () => 1.0, // 跌 2%
      }),
      state,
    );
    expect(actions).toHaveLength(0);
  });

  it('window 内不重复买', () => {
    const state: StrategyRuntimeState = { lastBuyDayIndex: 5 };
    const actions = evaluateStrategy(
      s,
      ctx({
        date: '2024-03-11',
        dayIndex: 6, // 距上次仅 1 天 < window(3)
        navToday: () => 0.9,
        navTradingDaysAgo: () => 1.0,
      }),
      state,
    );
    expect(actions).toHaveLength(0);
  });
});

describe('THRESHOLD_SELL 阈值卖出', () => {
  const s: Strategy = {
    id: 'ts1',
    name: '涨5卖',
    templateType: 'THRESHOLD_SELL',
    fundCode: '000001',
    params: { type: 'THRESHOLD_SELL', risePct: 0.05, window: 3, amount: 2000 },
    enabled: true,
  };

  it('涨幅达标且有持仓时触发卖出', () => {
    const state: StrategyRuntimeState = {};
    const actions = evaluateStrategy(
      s,
      ctx({
        date: '2024-03-10',
        dayIndex: 5,
        navToday: () => 1.07,
        navTradingDaysAgo: (_c, n) => (n === 3 ? 1.0 : undefined), // 涨 7%
        position: () => ({ fundCode: '000001', shares: 1000, cost: 1000, avgCost: 1.0 }),
      }),
      state,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].side).toBe('SELL');
    expect(actions[0].amount).toBe(2000);
  });

  it('无持仓不触发', () => {
    const actions = evaluateStrategy(
      s,
      ctx({ date: '2024-03-10', navToday: () => 1.1, navTradingDaysAgo: () => 1.0 }),
      {},
    );
    expect(actions).toHaveLength(0);
  });

  it('涨幅不足不触发', () => {
    const actions = evaluateStrategy(
      s,
      ctx({
        date: '2024-03-10',
        navToday: () => 1.02,
        navTradingDaysAgo: () => 1.0, // 涨 2%
        position: () => ({ fundCode: '000001', shares: 1000, cost: 1000, avgCost: 1.0 }),
      }),
      {},
    );
    expect(actions).toHaveLength(0);
  });

  it('window 内不重复卖', () => {
    const state: StrategyRuntimeState = { lastSellDayIndex: 5 };
    const actions = evaluateStrategy(
      s,
      ctx({
        date: '2024-03-11',
        dayIndex: 6,
        navToday: () => 1.2,
        navTradingDaysAgo: () => 1.0,
        position: () => ({ fundCode: '000001', shares: 1000, cost: 1000, avgCost: 1.0 }),
      }),
      state,
    );
    expect(actions).toHaveLength(0);
  });
});

describe('TAKE_PROFIT / STOP_LOSS', () => {
  it('止盈触发', () => {
    const s: Strategy = {
      id: 'tp',
      name: '止盈',
      templateType: 'TAKE_PROFIT',
      fundCode: '000001',
      params: { type: 'TAKE_PROFIT', gainPct: 0.2, sellRatio: 0.5 },
      enabled: true,
    };
    const actions = evaluateStrategy(
      s,
      ctx({
        date: '2024-03-10',
        navToday: () => 1.3,
        position: () => ({ fundCode: '000001', shares: 1000, cost: 1000, avgCost: 1.0 }),
      }),
      {},
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].side).toBe('SELL');
    expect(actions[0].ratio).toBe(0.5);
  });

  it('止损触发', () => {
    const s: Strategy = {
      id: 'sl',
      name: '止损',
      templateType: 'STOP_LOSS',
      fundCode: '000001',
      params: { type: 'STOP_LOSS', lossPct: 0.1, sellRatio: 1 },
      enabled: true,
    };
    const actions = evaluateStrategy(
      s,
      ctx({
        date: '2024-03-10',
        navToday: () => 0.85,
        position: () => ({ fundCode: '000001', shares: 1000, cost: 1000, avgCost: 1.0 }),
      }),
      {},
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].ratio).toBe(1);
  });

  it('无持仓不触发止盈', () => {
    const s: Strategy = {
      id: 'tp',
      name: '止盈',
      templateType: 'TAKE_PROFIT',
      fundCode: '000001',
      params: { type: 'TAKE_PROFIT', gainPct: 0.2, sellRatio: 0.5 },
      enabled: true,
    };
    expect(evaluateStrategy(s, ctx({ date: '2024-03-10', navToday: () => 2 }), {})).toHaveLength(0);
  });
});

describe('navToGridLevel', () => {
  const p = { type: 'GRID' as const, lower: 1.0, upper: 2.0, grids: 4, perGridAmount: 1000 };
  it('映射净值到网格层', () => {
    expect(navToGridLevel(0.9, p)).toBe(0);
    expect(navToGridLevel(1.0, p)).toBe(0);
    expect(navToGridLevel(1.25, p)).toBe(1);
    expect(navToGridLevel(1.5, p)).toBe(2);
    expect(navToGridLevel(2.1, p)).toBe(4);
  });
});

describe('GRID 网格', () => {
  const s: Strategy = {
    id: 'g1',
    name: '网格',
    templateType: 'GRID',
    fundCode: '000001',
    params: { type: 'GRID', lower: 1.0, upper: 2.0, grids: 4, perGridAmount: 1000 },
    enabled: true,
  };

  it('首日初始化不交易', () => {
    const state: StrategyRuntimeState = {};
    const actions = evaluateStrategy(s, ctx({ date: '2024-03-01', navToday: () => 1.5 }), state);
    expect(actions).toHaveLength(0);
    expect(state.lastGridLevel).toBe(2);
  });

  it('下穿买入', () => {
    const state: StrategyRuntimeState = { initialized: true, lastGridLevel: 2 };
    const actions = evaluateStrategy(s, ctx({ date: '2024-03-02', navToday: () => 1.2 }), state);
    expect(actions).toHaveLength(1);
    expect(actions[0].side).toBe('BUY');
    // 从第 2 格跌到第 0 格，跨 2 格 → 2 × perGridAmount
    expect(actions[0].amount).toBe(2000);
  });

  it('上穿卖出', () => {
    const state: StrategyRuntimeState = { initialized: true, lastGridLevel: 1 };
    const actions = evaluateStrategy(
      s,
      ctx({
        date: '2024-03-02',
        navToday: () => 1.75,
        position: () => ({ fundCode: '000001', shares: 5000, cost: 5000, avgCost: 1 }),
      }),
      state,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].side).toBe('SELL');
  });
});

// 辅助：消除未使用导入告警
const _navPoint: NavPoint = { date: '2024-01-01', nav: 1 };
void _navPoint;

describe('SMART_DCA_CHANGE 智能定投-涨跌幅', () => {
  const mk = (over: Partial<import('../domain').SmartDcaChangeParams> = {}): Strategy => ({
    id: 'sc1',
    name: '智能定投涨跌',
    templateType: 'SMART_DCA_CHANGE',
    fundCode: '000001',
    enabled: true,
    params: {
      type: 'SMART_DCA_CHANGE',
      period: 'MONTHLY',
      dayOfPeriod: 5,
      baseAmount: 1000,
      referenceWindow: 20,
      stepPct: 0.1, // 每跌/涨 10%
      adjustPct: 0.5, // 调整 50%
      minFactor: 0,
      maxFactor: 2,
      ...over,
    },
  });

  it('下跌时加大投入（factor>1）', () => {
    // 近 20 日跌 10% → deviation -0.1 → factor = 1 - (-0.1/0.1)*0.5 = 1.5
    const actions = evaluateStrategy(
      mk(),
      ctx({
        date: '2024-03-05',
        navToday: () => 0.9,
        navTradingDaysAgo: (_c, n) => (n === 20 ? 1.0 : undefined),
      }),
      {},
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].amount).toBe(1500);
  });

  it('上涨时减少投入（factor<1）', () => {
    // 涨 10% → deviation +0.1 → factor = 1 - (0.1/0.1)*0.5 = 0.5
    const actions = evaluateStrategy(
      mk(),
      ctx({ date: '2024-03-05', navToday: () => 1.1, navTradingDaysAgo: () => 1.0 }),
      {},
    );
    expect(actions[0].amount).toBe(500);
  });

  it('factor 受 min/max 限制（暴跌封顶 maxFactor）', () => {
    // 跌 50% → factor = 1 - (-0.5/0.1)*0.5 = 3.5 → 封顶 2
    const actions = evaluateStrategy(
      mk(),
      ctx({ date: '2024-03-05', navToday: () => 0.5, navTradingDaysAgo: () => 1.0 }),
      {},
    );
    expect(actions[0].amount).toBe(2000);
  });

  it('factor 降到 0 时不买入（暴涨）', () => {
    // 涨 40% → factor = 1 - (0.4/0.1)*0.5 = -1 → 下限 0 → amount 0 → 跳过
    const actions = evaluateStrategy(
      mk(),
      ctx({ date: '2024-03-05', navToday: () => 1.4, navTradingDaysAgo: () => 1.0 }),
      {},
    );
    expect(actions).toHaveLength(0);
  });

  it('非执行日不触发', () => {
    const actions = evaluateStrategy(
      mk(),
      ctx({ date: '2024-03-04', navToday: () => 0.9, navTradingDaysAgo: () => 1.0 }),
      {},
    );
    expect(actions).toHaveLength(0);
  });

  it('参考数据不足时退化为基准金额', () => {
    const actions = evaluateStrategy(
      mk(),
      ctx({ date: '2024-03-05', navToday: () => 1.0, navTradingDaysAgo: () => undefined }),
      {},
    );
    expect(actions[0].amount).toBe(1000);
  });
});

describe('SMART_DCA_MA 智能定投-均线', () => {
  const s: Strategy = {
    id: 'sm1',
    name: '智能定投均线',
    templateType: 'SMART_DCA_MA',
    fundCode: '000001',
    enabled: true,
    params: {
      type: 'SMART_DCA_MA',
      period: 'MONTHLY',
      dayOfPeriod: 5,
      baseAmount: 1000,
      maWindow: 5,
      stepPct: 0.1,
      adjustPct: 0.5,
      minFactor: 0,
      maxFactor: 2,
    },
  };

  it('低于均线时加大投入', () => {
    // 5 日净值 [1,1,1,1,1]，MA=1，今值 0.9 → deviation -0.1 → factor 1.5
    const hist = ['2024-02-28', '2024-02-29', '2024-03-01', '2024-03-04', '2024-03-05'].map(
      (date, i) => ({ date, nav: i === 4 ? 0.9 : 1.0 }),
    );
    const actions = evaluateStrategy(
      s,
      ctx({ date: '2024-03-05', navToday: () => 0.9, navHistory: () => hist }),
      {},
    );
    expect(actions).toHaveLength(1);
    // MA = (1+1+1+1+0.9)/5 = 0.98；deviation = (0.9-0.98)/0.98 ≈ -0.0816 → factor≈1.408 → 1408
    expect(actions[0].amount).toBeGreaterThan(1000);
  });

  it('高于均线时减少投入', () => {
    const hist = ['2024-02-28', '2024-02-29', '2024-03-01', '2024-03-04', '2024-03-05'].map(
      (date, i) => ({ date, nav: i === 4 ? 1.2 : 1.0 }),
    );
    const actions = evaluateStrategy(
      s,
      ctx({ date: '2024-03-05', navToday: () => 1.2, navHistory: () => hist }),
      {},
    );
    expect(actions[0].amount).toBeLessThan(1000);
  });
});

describe('VALUE_AVERAGING 目标市值法定投', () => {
  const mk = (over: Partial<import('../domain').ValueAveragingParams> = {}): Strategy => ({
    id: 'va1',
    name: '目标市值法',
    templateType: 'VALUE_AVERAGING',
    fundCode: '000001',
    enabled: true,
    params: {
      type: 'VALUE_AVERAGING',
      period: 'MONTHLY',
      dayOfPeriod: 5,
      targetStep: 2000,
      allowSell: true,
      maxBuy: 0,
      ...over,
    },
  });

  it('首期无持仓：买入达到目标市值', () => {
    const actions = evaluateStrategy(mk(), ctx({ date: '2024-03-05', navToday: () => 1.0 }), {});
    expect(actions).toHaveLength(1);
    expect(actions[0].side).toBe('BUY');
    // 第1期目标 2000，当前 0 → 买 2000
    expect(actions[0].amount).toBe(2000);
  });

  it('第2期目标翻倍，下跌时多补差额', () => {
    const state = {};
    // 第1期：净值1.0 买 2000（得约2000份）
    evaluateStrategy(mk(), ctx({ date: '2024-03-05', navToday: () => 1.0 }), state);
    // 第2期：净值跌到 0.5，持仓约 2000份×0.5=1000，目标 4000 → 补 3000
    const actions = evaluateStrategy(
      mk(),
      ctx({
        date: '2024-04-05',
        navToday: () => 0.5,
        position: () => ({ fundCode: '000001', shares: 2000, cost: 2000, avgCost: 1.0 }),
      }),
      state,
    );
    expect(actions[0].side).toBe('BUY');
    expect(actions[0].amount).toBe(3000); // 4000 - 1000
  });

  it('市值超过目标时卖出（allowSell=true）', () => {
    const state = { vaPeriodCount: 0 };
    // 直接进入第1期，目标 2000，但持仓已涨到 3000 → 卖出 1000/nav 份
    const actions = evaluateStrategy(
      mk(),
      ctx({
        date: '2024-03-05',
        navToday: () => 2.0,
        position: () => ({ fundCode: '000001', shares: 1500, cost: 1500, avgCost: 1.0 }), // 市值 3000
      }),
      state,
    );
    expect(actions[0].side).toBe('SELL');
    // 超出 1000，按 nav=2.0 → 卖 500 份
    expect(actions[0].shares).toBeCloseTo(500, 4);
  });

  it('allowSell=false 时市值超目标不卖', () => {
    const actions = evaluateStrategy(
      mk({ allowSell: false }),
      ctx({
        date: '2024-03-05',
        navToday: () => 2.0,
        position: () => ({ fundCode: '000001', shares: 1500, cost: 1500, avgCost: 1.0 }),
      }),
      { vaPeriodCount: 0 },
    );
    expect(actions).toHaveLength(0);
  });

  it('maxBuy 限制单期买入额', () => {
    const actions = evaluateStrategy(
      mk({ targetStep: 10000, maxBuy: 3000 }),
      ctx({ date: '2024-03-05', navToday: () => 1.0 }),
      {},
    );
    // 目标 10000，但单期最多买 3000
    expect(actions[0].amount).toBe(3000);
  });

  it('非执行日不触发', () => {
    const actions = evaluateStrategy(mk(), ctx({ date: '2024-03-04', navToday: () => 1.0 }), {});
    expect(actions).toHaveLength(0);
  });
});

describe('SMART_TAKE_PROFIT 智能止盈', () => {
  const s: Strategy = {
    id: 'stp1',
    name: '智能止盈',
    templateType: 'SMART_TAKE_PROFIT',
    fundCode: '000001',
    enabled: true,
    params: {
      type: 'SMART_TAKE_PROFIT',
      startGainPct: 0.1, // +10% 起卖
      stepPct: 0.1, // 每多涨 10% 一档
      stepSellRatio: 0.2, // 每档卖 20%
      maxSellRatio: 0.5,
    },
  };
  const pos = (avgCost: number) => ({ fundCode: '000001', shares: 1000, cost: 1000, avgCost });

  it('未达起始收益不卖', () => {
    const actions = evaluateStrategy(
      s,
      ctx({ date: '2024-03-10', navToday: () => 1.05, position: () => pos(1.0) }),
      {},
    );
    expect(actions).toHaveLength(0);
  });

  it('达到第1档卖出 stepSellRatio', () => {
    // +12% → tier = floor((0.12-0.1)/0.1)+1 = 1
    const actions = evaluateStrategy(
      s,
      ctx({ date: '2024-03-10', navToday: () => 1.12, position: () => pos(1.0) }),
      {},
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].side).toBe('SELL');
    expect(actions[0].ratio).toBeCloseTo(0.2, 6);
  });

  it('同档不重复卖', () => {
    const state = { lastProfitTier: 1 };
    const actions = evaluateStrategy(
      s,
      ctx({ date: '2024-03-11', navToday: () => 1.15, position: () => pos(1.0) }),
      state,
    );
    expect(actions).toHaveLength(0);
  });

  it('跨多档一次性按档数累加比例（受上限约束）', () => {
    // +45% → tier = floor((0.45-0.1)/0.1)+1 = 4；从 0 档跳到 4 档 → 4×0.2=0.8 → 封顶 0.5
    const actions = evaluateStrategy(
      s,
      ctx({ date: '2024-03-10', navToday: () => 1.45, position: () => pos(1.0) }),
      {},
    );
    expect(actions[0].ratio).toBeCloseTo(0.5, 6);
  });

  it('收益回落到低档不卖（已触发更高档）', () => {
    const state = { lastProfitTier: 3 };
    const actions = evaluateStrategy(
      s,
      ctx({ date: '2024-03-12', navToday: () => 1.15, position: () => pos(1.0) }),
      state,
    );
    expect(actions).toHaveLength(0);
  });

  it('无持仓不触发', () => {
    expect(
      evaluateStrategy(s, ctx({ date: '2024-03-10', navToday: () => 2.0 }), {}),
    ).toHaveLength(0);
  });
});
