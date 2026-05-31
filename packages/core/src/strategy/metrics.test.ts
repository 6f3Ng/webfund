import { describe, it, expect } from 'vitest';
import {
  maxDrawdown,
  holdingMaxDrawdown,
  drawdownOf,
  drawdownDetail,
  dailyReturns,
  stdDev,
  annualizedVolatility,
  sharpeRatio,
  sortinoRatio,
  calmarRatio,
  winningDaysRatio,
  totalReturn,
  annualizedReturn,
} from './metrics';
import type { DailySnapshot } from './backtest-types';

function snap(date: string, total: number): DailySnapshot {
  return {
    date,
    totalAssets: total,
    cash: 0,
    marketValue: total,
    cost: total,
    investedCapital: total,
    holdingIndex: 1,
  };
}

describe('maxDrawdown', () => {
  it('计算最大回撤', () => {
    const curve = [snap('d1', 100), snap('d2', 120), snap('d3', 90), snap('d4', 110)];
    // 峰值 120，谷底 90 → 回撤 (120-90)/120 = 0.25
    expect(maxDrawdown(curve)).toBe(0.25);
  });

  it('单调上涨回撤为 0', () => {
    expect(maxDrawdown([snap('d1', 100), snap('d2', 110), snap('d3', 120)])).toBe(0);
  });

  it('空曲线回撤为 0', () => {
    expect(maxDrawdown([])).toBe(0);
  });
});

describe('drawdownOf', () => {
  it('在任意数值序列上计算回撤', () => {
    // 持有指数 1 → 1.2 → 0.6 → 0.8：峰值 1.2 谷底 0.6 → 回撤 0.5
    expect(drawdownOf([1, 1.2, 0.6, 0.8])).toBe(0.5);
  });
  it('单调上涨回撤为 0', () => {
    expect(drawdownOf([1, 1.1, 1.2])).toBe(0);
  });
  it('跳过非有限值', () => {
    expect(drawdownOf([1, NaN, 0.5])).toBe(0.5);
  });
});

describe('holdingMaxDrawdown', () => {
  it('基于持有指数而非总资产，不被现金稀释', () => {
    // 总资产几乎不动（现金占大头），但持有指数大幅回撤
    const curve: DailySnapshot[] = [
      { date: 'd1', totalAssets: 100000, cash: 98000, marketValue: 2000, cost: 2000, investedCapital: 2000, holdingIndex: 1 },
      { date: 'd2', totalAssets: 100600, cash: 98000, marketValue: 2600, cost: 2000, investedCapital: 2000, holdingIndex: 1.3 },
      { date: 'd3', totalAssets: 99400, cash: 98000, marketValue: 1400, cost: 2000, investedCapital: 2000, holdingIndex: 0.7 },
    ];
    // 总资产回撤很小（被现金稀释）
    expect(maxDrawdown(curve)).toBeLessThan(0.02);
    // 持有回撤：1.3 → 0.7 = (1.3-0.7)/1.3 ≈ 0.4615
    expect(holdingMaxDrawdown(curve)).toBeCloseTo(0.4615, 3);
  });
});

describe('totalReturn', () => {
  it('正常计算', () => {
    expect(totalReturn(10000, 12000)).toBe(0.2);
    expect(totalReturn(10000, 8000)).toBe(-0.2);
  });
  it('初始为 0 返回 0', () => {
    expect(totalReturn(0, 100)).toBe(0);
  });
});

describe('annualizedReturn', () => {
  it('一年翻倍 → 约 100% 年化', () => {
    const r = annualizedReturn(10000, 20000, '2023-01-01', '2024-01-01');
    expect(r).toBeCloseTo(1.0, 1);
  });

  it('半年涨 10% → 年化约 21%', () => {
    const r = annualizedReturn(10000, 11000, '2024-01-01', '2024-07-01');
    expect(r).toBeGreaterThan(0.2);
    expect(r).toBeLessThan(0.22);
  });
});

describe('风险调整指标', () => {
  it('dailyReturns 计算日收益序列', () => {
    expect(dailyReturns([1, 1.1, 1.21])).toEqual([
      expect.closeTo(0.1, 6),
      expect.closeTo(0.1, 6),
    ]);
    // 非正前值跳过
    expect(dailyReturns([0, 1, 2])).toEqual([expect.closeTo(1, 6)]);
  });

  it('stdDev 样本标准差', () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
    expect(stdDev([5])).toBe(0);
  });

  it('annualizedVolatility 年化波动率', () => {
    const r = [0.01, -0.01, 0.02, -0.02, 0.01];
    const vol = annualizedVolatility(r);
    expect(vol).toBeGreaterThan(0);
    // 应约等于 std × sqrt(252)
    expect(vol).toBeCloseTo(stdDev(r) * Math.sqrt(252), 4);
  });

  it('sharpeRatio', () => {
    expect(sharpeRatio(0.2, 0.1)).toBe(2);
    expect(sharpeRatio(0.2, 0.1, 0.03)).toBeCloseTo(1.7, 4);
    expect(sharpeRatio(0.2, 0)).toBe(0); // 零波动返回 0
  });

  it('sortinoRatio 只罚下行', () => {
    // 全正收益 → 下行波动 0 → 返回 0
    expect(sortinoRatio([0.01, 0.02, 0.03], 0.2)).toBe(0);
    // 含负收益 → 有下行波动 → 正比率
    expect(sortinoRatio([0.02, -0.03, 0.01, -0.02], 0.2)).toBeGreaterThan(0);
  });

  it('calmarRatio = 年化收益 / 最大回撤', () => {
    expect(calmarRatio(0.3, 0.15)).toBe(2);
    expect(calmarRatio(0.3, 0)).toBe(0);
  });

  it('winningDaysRatio 盈利日占比', () => {
    expect(winningDaysRatio([0.1, -0.1, 0.2, 0])).toBe(0.5); // 2 盈利 / 4
    expect(winningDaysRatio([])).toBe(0);
  });

  it('drawdownDetail 给出峰值/谷底日期', () => {
    const curve = [
      { date: 'd1', value: 1 },
      { date: 'd2', value: 1.5 },
      { date: 'd3', value: 0.75 },
      { date: 'd4', value: 1.0 },
    ];
    const d = drawdownDetail(curve);
    expect(d.maxDrawdown).toBe(0.5); // 1.5 → 0.75
    expect(d.peakDate).toBe('d2');
    expect(d.troughDate).toBe('d3');
  });
});
