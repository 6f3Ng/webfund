import type { Valuation, ValuationProvider, ValuationSourceId } from '@fund/core';
import { ValuationAggregator } from '@fund/core';
import { fetchValuation, fetchSelfValuation, type ValuationResponse } from './funds';

function toValuation(r: ValuationResponse): Valuation {
  return {
    fundCode: r.fundCode,
    name: r.name,
    source: r.source,
    estimatedNav: r.estimatedNav,
    estimatedGrowthPct: r.estimatedGrowthPct,
    estimatedAt: r.estimatedAt,
    baseNav: r.baseNav,
    baseNavDate: r.baseNavDate,
    confidence: r.confidence,
    error: r.error,
  };
}

/** 接口估值数据源（天天/蛋卷），通过 Workers 获取 */
class ApiValuationProvider implements ValuationProvider {
  constructor(
    public readonly id: ValuationSourceId,
    public readonly name: string,
  ) {}

  async getValuation(codes: string[]): Promise<Valuation[]> {
    if (this.id === 'self-calc') {
      const res = await fetchSelfValuation(codes);
      return res.map(toValuation);
    }
    const res = await fetchValuation(codes, this.id);
    return res.map(toValuation);
  }
}

/** 构建并注册所有数据源的聚合器（供 store 单例使用） */
export function createAggregator(): ValuationAggregator {
  return new ValuationAggregator()
    .register(new ApiValuationProvider('eastmoney', '天天基金'))
    .register(new ApiValuationProvider('danjuan', '蛋卷基金'))
    .register(new ApiValuationProvider('self-calc', '自建估算'));
}
