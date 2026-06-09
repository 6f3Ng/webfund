import { describe, it, expect } from 'vitest';
import { runBacktest } from './backtest';
import type { BacktestInput } from './backtest-types';
import { DEFAULT_CONFLICT_POLICY, type NavPoint, type Strategy } from '../domain';

/** 生成连续交易日净值序列（工作日，简化忽略节假日） */
function makeNav(start: string, navs: number[]): NavPoint[] {
  const points: NavPoint[] = [];
  const [y, m, d] = start.split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  let i = 0;
  while (i < navs.length) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const date = cur.toISOString().slice(0, 10);
      points.push({ date, nav: navs[i] });
      i++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return points;
}

describe('runBacktest - 买入持有基准', () => {
  it('无策略时组合保持现金，基准反映标的涨幅', () => {
    const nav = makeNav('2024-01-01', [1.0, 1.1, 1.2, 1.25, 1.3]);
    const input: BacktestInput = {
      strategies: [],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[nav.length - 1].date,
      initialCash: 10000,
      purchaseFeeRate: 0,
    };
    const result = runBacktest(input);
    // 无策略，组合全是现金，收益 0
    expect(result.metrics.totalReturn).toBe(0);
    expect(result.metrics.finalAssets).toBe(10000);
    // 基准买入持有：净值 1.0 → 1.3，收益 30%
    expect(result.benchmark?.totalReturn).toBeCloseTo(0.3, 4);
  });
});

describe('runBacktest - 定投策略', () => {
  it('每月定投累积份额', () => {
    // 3 个月，每月 1 号定投（构造每月 1 号为工作日的数据较难，用每日近似）
    const nav = makeNav('2024-01-01', Array.from({ length: 60 }, (_, i) => 1.0 + i * 0.01));
    const dca: Strategy = {
      id: 'd1',
      name: '月投',
      templateType: 'DCA',
      fundCode: '000001',
      params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: 1, amount: 1000 },
      enabled: true,
    };
    const result = runBacktest({
      strategies: [dca],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[nav.length - 1].date,
      initialCash: 10000,
      purchaseFeeRate: 0,
    });
    // 至少发生了买入（跨越了多个月份）
    const buys = result.trades.filter((t) => t.side === 'BUY');
    expect(buys.length).toBeGreaterThanOrEqual(2);
    // 现金减少，持仓有市值
    expect(result.curve[result.curve.length - 1].marketValue).toBeGreaterThan(0);
  });
});

describe('runBacktest - 止盈策略', () => {
  it('买入后涨到止盈线卖出', () => {
    // 第 1 天定投买入，之后涨 30%，止盈线 20%
    const nav = makeNav('2024-01-01', [1.0, 1.05, 1.1, 1.25, 1.3, 1.35]);
    const strategies: Strategy[] = [
      {
        id: 'd1',
        name: '首日买',
        templateType: 'DCA',
        fundCode: '000001',
        params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: new Date(nav[0].date).getUTCDate(), amount: 5000 },
        enabled: true,
      },
      {
        id: 'tp',
        name: '止盈',
        templateType: 'TAKE_PROFIT',
        fundCode: '000001',
        params: { type: 'TAKE_PROFIT', gainPct: 0.2, sellRatio: 1 },
        enabled: true,
      },
    ];
    const result = runBacktest({
      strategies,
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[nav.length - 1].date,
      initialCash: 10000,
      purchaseFeeRate: 0,
      redeemFeeRate: 0,
    });
    const buys = result.trades.filter((t) => t.side === 'BUY');
    const sells = result.trades.filter((t) => t.side === 'SELL');
    expect(buys.length).toBeGreaterThanOrEqual(1);
    expect(sells.length).toBeGreaterThanOrEqual(1);
    // 止盈后有正收益
    expect(result.metrics.totalReturn).toBeGreaterThan(0);
  });
});

describe('runBacktest - 指标与边界', () => {
  it('最大回撤随净值下跌产生', () => {
    const nav = makeNav('2024-01-01', [1.0, 1.2, 0.9, 1.0]);
    const dca: Strategy = {
      id: 'd1',
      name: '首日满仓',
      templateType: 'DCA',
      fundCode: '000001',
      params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: new Date(nav[0].date).getUTCDate(), amount: 10000 },
      enabled: true,
    };
    const result = runBacktest({
      strategies: [dca],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[nav.length - 1].date,
      initialCash: 10000,
      purchaseFeeRate: 0,
    });
    // 净值 1.2 峰值后跌到 0.9，回撤应 > 0
    expect(result.metrics.maxDrawdown).toBeGreaterThan(0);
  });

  it('阈值卖出按金额成交（不足持仓则全卖）', () => {
    // 首日买入建仓，之后涨幅触发阈值卖出固定金额
    const nav = makeNav('2024-01-01', [1.0, 1.0, 1.0, 1.0, 1.2, 1.2]);
    const strategies: Strategy[] = [
      {
        id: 'b',
        name: '首买',
        templateType: 'DCA',
        fundCode: '000001',
        params: {
          type: 'DCA',
          period: 'MONTHLY',
          dayOfPeriod: new Date(nav[0].date).getUTCDate(),
          amount: 10000,
        },
        enabled: true,
      },
      {
        id: 'ts',
        name: '涨卖',
        templateType: 'THRESHOLD_SELL',
        fundCode: '000001',
        params: { type: 'THRESHOLD_SELL', risePct: 0.1, window: 2, amount: 3000 },
        enabled: true,
      },
    ];
    const result = runBacktest({
      strategies,
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[nav.length - 1].date,
      initialCash: 20000,
      purchaseFeeRate: 0,
      redeemFeeRate: 0,
    });
    const sells = result.trades.filter((t) => t.side === 'SELL');
    expect(sells.length).toBeGreaterThanOrEqual(1);
    // 卖出金额约 3000（净值 1.2 → 份额 2500），毛额 = 份额×净值 ≈ 3000
    expect(sells[0].amount).toBeCloseTo(3000, 0);
    expect(sells[0].shares).toBeCloseTo(2500, 0);
  });

  it('空净值数据安全返回', () => {
    const result = runBacktest({
      strategies: [],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: {},
      start: '2024-01-01',
      end: '2024-01-31',
      initialCash: 10000,
    });
    expect(result.metrics.finalAssets).toBe(10000);
    expect(result.curve).toHaveLength(0);
  });

  it('丰富指标：资金流、期末状态、持有收益与曲线字段', () => {
    // 首日满仓买入，净值翻倍持有
    const nav = makeNav('2024-01-01', [1.0, 1.5, 2.0]);
    const dca: Strategy = {
      id: 'd1',
      name: '首日满仓',
      templateType: 'DCA',
      fundCode: '000001',
      params: {
        type: 'DCA',
        period: 'MONTHLY',
        dayOfPeriod: new Date(nav[0].date).getUTCDate(),
        amount: 10000,
      },
      enabled: true,
    };
    const result = runBacktest({
      strategies: [dca],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[nav.length - 1].date,
      initialCash: 10000,
      purchaseFeeRate: 0,
    });
    const m = result.metrics;
    // 投入 10000，净值 1.0→2.0 翻倍
    expect(m.initialCash).toBe(10000);
    expect(m.totalBought).toBe(10000);
    expect(m.netInvested).toBe(10000);
    expect(m.finalCash).toBe(0);
    expect(m.finalHoldingValue).toBeCloseTo(20000, 0); // 10000份×2.0
    expect(m.finalHoldingCost).toBe(10000);
    expect(m.holdingProfit).toBeCloseTo(10000, 0);
    expect(m.totalProfit).toBeCloseTo(10000, 0);
    expect(m.totalReturn).toBeCloseTo(1.0, 2);
    // 持有收益（时间加权）≈ +100%
    expect(m.holdingReturn).toBeCloseTo(1.0, 1);
    expect(m.buyCount).toBe(1);
    expect(m.sellCount).toBe(0);
    expect(m.tradingDays).toBe(3);
    // 曲线含新字段
    const lastPt = result.curve[result.curve.length - 1];
    expect(lastPt.cost).toBe(10000);
    expect(lastPt.investedCapital).toBe(10000);
    expect(lastPt.holdingIndex).toBeCloseTo(2.0, 1);
  });

  it('持有最大回撤反映持仓真实回撤（不被现金稀释）', () => {
    // 大量闲置现金，小仓位标的暴跌
    const nav = makeNav('2024-01-01', [1.0, 1.5, 0.75]); // 峰值1.5 跌到0.75 → 持有回撤50%
    const dca: Strategy = {
      id: 'd1',
      name: '小额定投',
      templateType: 'DCA',
      fundCode: '000001',
      params: {
        type: 'DCA',
        period: 'MONTHLY',
        dayOfPeriod: new Date(nav[0].date).getUTCDate(),
        amount: 2000, // 仅投 2000，其余 98000 闲置
      },
      enabled: true,
    };
    const result = runBacktest({
      strategies: [dca],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[nav.length - 1].date,
      initialCash: 100000,
      purchaseFeeRate: 0,
    });
    // 总资产回撤很小（被 98000 现金稀释）
    expect(result.metrics.maxDrawdown).toBeLessThan(0.02);
    // 持有回撤接近 50%（反映标的真实回撤）
    expect(result.metrics.holdingMaxDrawdown).toBeGreaterThan(0.4);
  });

  it('申购费降低买入份额', () => {
    const nav = makeNav('2024-01-01', [1.0, 1.0]);
    const dca: Strategy = {
      id: 'd1',
      name: '买',
      templateType: 'DCA',
      fundCode: '000001',
      params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: new Date(nav[0].date).getUTCDate(), amount: 1015 },
      enabled: true,
    };
    const result = runBacktest({
      strategies: [dca],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[1].date,
      initialCash: 10000,
      purchaseFeeRate: 0.015,
    });
    const buy = result.trades.find((t) => t.side === 'BUY')!;
    // 1015 / 1.015 = 1000 净申购，净值 1.0 → 1000 份，费 15
    expect(buy.shares).toBeCloseTo(1000, 2);
    expect(buy.fee).toBeCloseTo(15, 2);
  });
});

describe('runBacktest - 去掉初始资金限制 + 重算指标', () => {
  it('买入超过可用现金时仍成交（现金可为负，视为追加投入）', () => {
    // 每月定投 ¥5000，但初始资金仅 ¥1000；去掉限制后应照常买入
    const nav = makeNav('2024-01-01', Array.from({ length: 60 }, (_, i) => 1.0 + i * 0.01));
    const dca: Strategy = {
      id: 'd1',
      name: '月投',
      templateType: 'DCA',
      fundCode: '000001',
      params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: 1, amount: 5000 },
      enabled: true,
    };
    const result = runBacktest({
      strategies: [dca],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[nav.length - 1].date,
      initialCash: 1000,
      purchaseFeeRate: 0,
    });
    const buys = result.trades.filter((t) => t.side === 'BUY');
    expect(buys.length).toBeGreaterThanOrEqual(2); // 跨多个月份均成交
    // 累计买入远超期初资金，现金为负（追加投入）
    expect(result.metrics.totalBought).toBeGreaterThan(5000);
    expect(result.metrics.finalCash).toBeLessThan(0);
  });

  it('不提供 initialCash 时自动按策略所需资金推导，期间现金不为负', () => {
    // 每月定投 ¥5000，未提供初始资金；引擎应自动推导期初资金使现金不为负
    const nav = makeNav('2024-01-01', Array.from({ length: 60 }, (_, i) => 1.0 + i * 0.01));
    const dca: Strategy = {
      id: 'd1',
      name: '月投',
      templateType: 'DCA',
      fundCode: '000001',
      params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: 1, amount: 5000 },
      enabled: true,
    };
    const result = runBacktest({
      strategies: [dca],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[nav.length - 1].date,
      // 不提供 initialCash
      purchaseFeeRate: 0,
    });
    // 自动推导的期初资金 = 累计买入（首次平移使最低现金=0）
    expect(result.metrics.initialCash).toBeGreaterThan(0);
    expect(result.metrics.initialCash).toBeCloseTo(result.metrics.totalBought, 0);
    // 期间现金不为负（最低点恰好 0）
    const minCash = Math.min(...result.curve.map((p) => p.cash));
    expect(minCash).toBeGreaterThanOrEqual(-1e-6);
    // 期末现金 = 期初 − 累计买入 ≈ 0（全部投入持仓）
    expect(result.metrics.finalCash).toBeCloseTo(0, 0);
  });

  it('期末份额/成本单价/实际单价/累计收益率/持有收益率口径正确', () => {
    // 首日 ¥10000 满仓买入（净值 1.0 → 10000 份），净值翻倍到 2.0
    const nav = makeNav('2024-01-01', [1.0, 1.5, 2.0]);
    const dca: Strategy = {
      id: 'd1',
      name: '首日满仓',
      templateType: 'DCA',
      fundCode: '000001',
      params: {
        type: 'DCA',
        period: 'MONTHLY',
        dayOfPeriod: new Date(nav[0].date).getUTCDate(),
        amount: 10000,
      },
      enabled: true,
    };
    const m = runBacktest({
      strategies: [dca],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': nav },
      start: nav[0].date,
      end: nav[nav.length - 1].date,
      initialCash: 10000,
      purchaseFeeRate: 0,
    }).metrics;
    // 期末持有 10000 份
    expect(m.finalHoldingShares).toBeCloseTo(10000, 0);
    // 成本单价 = 10000 成本 / 10000 份 = 1.0
    expect(m.finalCostPrice).toBeCloseTo(1.0, 4);
    // 实际单价 = 20000 市值 / 10000 份 = 2.0
    expect(m.finalUnitNav).toBeCloseTo(2.0, 4);
    // 持有收益率 = 浮盈 10000 / 成本 10000 = 100%
    expect(m.holdingProfitRate).toBeCloseTo(1.0, 2);
    // 累计收益率 = 总收益 10000 / 净投入 10000 = 100%
    expect(m.cumulativeReturn).toBeCloseTo(1.0, 2);
  });
});

describe('runBacktest - 基准（策略 / 指定基金 / 默认）', () => {
  const navA = makeNav('2024-01-01', [1.0, 1.1, 1.2, 1.25, 1.3]);
  const navB = makeNav('2024-01-01', [1.0, 0.9, 0.8, 0.85, 0.9]);

  it('指定基准基金时按该基金买入持有', () => {
    const result = runBacktest({
      strategies: [],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': navA, '000002': navB },
      start: navA[0].date,
      end: navA[navA.length - 1].date,
      initialCash: 10000,
      purchaseFeeRate: 0,
      benchmarkFundCode: '000002',
    });
    expect(result.benchmark?.kind).toBe('BUY_HOLD');
    expect(result.benchmark?.fundCode).toBe('000002');
    // 000002 净值 1.0 → 0.9，收益 -10%
    expect(result.benchmark?.totalReturn).toBeCloseTo(-0.1, 4);
  });

  it('提供 benchmarkStrategies 时按策略回测作为基准（优先于基金代码）', () => {
    const benchDca: Strategy = {
      id: 'b1',
      name: '基准定投',
      templateType: 'DCA',
      fundCode: '000001',
      params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: new Date(navA[0].date).getUTCDate(), amount: 5000 },
      enabled: true,
    };
    const result = runBacktest({
      strategies: [],
      conflictPolicy: DEFAULT_CONFLICT_POLICY,
      navData: { '000001': navA },
      start: navA[0].date,
      end: navA[navA.length - 1].date,
      initialCash: 10000,
      purchaseFeeRate: 0,
      benchmarkFundCode: '000001', // 应被 benchmarkStrategies 覆盖
      benchmarkStrategies: [benchDca],
      benchmarkLabel: '基准策略集',
    });
    expect(result.benchmark?.kind).toBe('STRATEGY');
    expect(result.benchmark?.label).toBe('基准策略集');
    // 基准策略首日投 5000 买入持有，净值 1.0→1.3，持有部分 +30%
    expect(result.benchmark?.totalReturn).toBeGreaterThan(0);
  });
});
