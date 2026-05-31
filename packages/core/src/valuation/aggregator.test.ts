import { describe, it, expect } from 'vitest';
import { ValuationAggregator } from './aggregator';
import type { Valuation, ValuationProvider, ValuationSourceId } from './types';

function mockProvider(
  id: ValuationSourceId,
  growth: number,
  opts?: { fail?: boolean },
): ValuationProvider {
  return {
    id,
    name: id,
    async getValuation(codes) {
      if (opts?.fail) throw new Error('source down');
      return codes.map<Valuation>((code) => ({
        fundCode: code,
        source: id,
        estimatedNav: 1 + growth / 100,
        estimatedGrowthPct: growth,
        estimatedAt: '2026-05-29 15:00',
      }));
    },
  };
}

describe('ValuationAggregator', () => {
  it('注册与列举数据源', () => {
    const agg = new ValuationAggregator()
      .register(mockProvider('eastmoney', 1))
      .register(mockProvider('danjuan', 2));
    expect(agg.listSources()).toEqual(['eastmoney', 'danjuan']);
    expect(agg.getProvider('eastmoney')?.id).toBe('eastmoney');
  });

  it('fetchFrom 单源', async () => {
    const agg = new ValuationAggregator().register(mockProvider('eastmoney', 1.5));
    const vals = await agg.fetchFrom('eastmoney', ['000001']);
    expect(vals[0].estimatedGrowthPct).toBe(1.5);
  });

  it('fetchFrom 未注册源抛错', async () => {
    const agg = new ValuationAggregator();
    await expect(agg.fetchFrom('eastmoney', ['000001'])).rejects.toThrow();
  });

  it('fetchCompare 构建多源对比矩阵', async () => {
    const agg = new ValuationAggregator()
      .register(mockProvider('eastmoney', 1))
      .register(mockProvider('danjuan', 2))
      .register(mockProvider('self-calc', 3));
    const matrix = await agg.fetchCompare(
      ['eastmoney', 'danjuan', 'self-calc'],
      ['000001', '000002'],
    );
    expect(matrix.get('000001')?.get('eastmoney')?.estimatedGrowthPct).toBe(1);
    expect(matrix.get('000001')?.get('danjuan')?.estimatedGrowthPct).toBe(2);
    expect(matrix.get('000002')?.get('self-calc')?.estimatedGrowthPct).toBe(3);
  });

  it('fetchCompare 某源失败不影响其他源', async () => {
    const agg = new ValuationAggregator()
      .register(mockProvider('eastmoney', 1))
      .register(mockProvider('danjuan', 2, { fail: true }));
    const matrix = await agg.fetchCompare(['eastmoney', 'danjuan'], ['000001']);
    expect(matrix.get('000001')?.get('eastmoney')?.estimatedGrowthPct).toBe(1);
    expect(matrix.get('000001')?.has('danjuan')).toBe(false);
  });
});
