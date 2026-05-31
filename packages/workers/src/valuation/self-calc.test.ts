import { describe, it, expect } from 'vitest';
import { computeSelfValuation, CSI300_SYMBOL } from './self-calc';
import type { FundHoldingsDTO, QuoteDTO } from '../dto';

function quote(symbol: string, growthPct: number): QuoteDTO {
  return { symbol, price: 0, prevClose: 0, growthPct };
}

describe('computeSelfValuation', () => {
  const holdings: FundHoldingsDTO = {
    fundCode: '110011',
    reportDate: '2026-03-31',
    holdings: [
      { symbol: 'sh600519', name: '贵州茅台', weightPct: 10 },
      { symbol: 'sz000858', name: '五粮液', weightPct: 8 },
    ],
    totalWeightPct: 18,
  };

  it('已覆盖加权 + 未覆盖按沪深300补全', () => {
    const quotes = new Map<string, QuoteDTO>([
      ['sh600519', quote('sh600519', 2.0)], // 权重 10% → 贡献 0.2
      ['sz000858', quote('sz000858', -1.0)], // 权重 8% → 贡献 -0.08
      [CSI300_SYMBOL, quote(CSI300_SYMBOL, 1.0)], // 指数涨 1%
    ]);
    // 覆盖权重 = 18%，未覆盖 82%
    // 加权 = 0.1*2 + 0.08*(-1) = 0.2 - 0.08 = 0.12
    // 未覆盖补全 = 0.82 * 1.0 = 0.82
    // 估算涨幅 = 0.12 + 0.82 = 0.94%
    const r = computeSelfValuation({
      fundCode: '110011',
      holdings,
      quotes,
      baseNav: 4.0,
      baseNavDate: '2026-03-30',
    });
    expect(r.source).toBe('self-calc');
    expect(r.estimatedGrowthPct).toBeCloseTo(0.94, 4);
    expect(r.estimatedNav).toBeCloseTo(4.0 * 1.0094, 4);
    expect(r.confidence).toBeCloseTo(0.18, 4);
  });

  it('个股行情缺失则视为未覆盖', () => {
    const quotes = new Map<string, QuoteDTO>([
      ['sh600519', quote('sh600519', 5.0)], // 只有这只有行情
      [CSI300_SYMBOL, quote(CSI300_SYMBOL, 0)],
    ]);
    // 覆盖 = 10%，加权 = 0.5；未覆盖 90% * 0 = 0 → 0.5%
    const r = computeSelfValuation({ fundCode: '110011', holdings, quotes, baseNav: 1 });
    expect(r.estimatedGrowthPct).toBeCloseTo(0.5, 4);
    expect(r.confidence).toBeCloseTo(0.1, 4);
  });

  it('无基准净值时估算净值为 0', () => {
    const quotes = new Map<string, QuoteDTO>([[CSI300_SYMBOL, quote(CSI300_SYMBOL, 1)]]);
    const r = computeSelfValuation({ fundCode: '110011', holdings, quotes });
    expect(r.estimatedNav).toBe(0);
  });

  it('沪深300 行情缺失时未覆盖部分按 0 处理', () => {
    const quotes = new Map<string, QuoteDTO>([['sh600519', quote('sh600519', 3.0)]]);
    const r = computeSelfValuation({ fundCode: '110011', holdings, quotes, baseNav: 1 });
    // 覆盖 10% * 3 = 0.3，未覆盖无指数 → 0
    expect(r.estimatedGrowthPct).toBeCloseTo(0.3, 4);
  });
});
