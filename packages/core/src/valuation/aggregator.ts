import type { FundCode } from '../domain';
import type { Valuation, ValuationProvider, ValuationSourceId } from './types';

/**
 * 估值聚合器：管理多个数据源 Provider，支持单源获取与多源并列对比。
 */
export class ValuationAggregator {
  private readonly providers = new Map<ValuationSourceId, ValuationProvider>();

  register(provider: ValuationProvider): this {
    this.providers.set(provider.id, provider);
    return this;
  }

  getProvider(id: ValuationSourceId): ValuationProvider | undefined {
    return this.providers.get(id);
  }

  listSources(): ValuationSourceId[] {
    return [...this.providers.keys()];
  }

  /** 从指定单一数据源获取估值 */
  async fetchFrom(source: ValuationSourceId, codes: FundCode[]): Promise<Valuation[]> {
    const provider = this.providers.get(source);
    if (!provider) throw new Error(`未注册数据源: ${source}`);
    if (codes.length === 0) return [];
    return provider.getValuation(codes);
  }

  /**
   * 多源并列获取，返回 fundCode → (source → Valuation) 的对比矩阵。
   * 某源整体失败不影响其他源。
   */
  async fetchCompare(
    sources: ValuationSourceId[],
    codes: FundCode[],
  ): Promise<Map<FundCode, Map<ValuationSourceId, Valuation>>> {
    const result = new Map<FundCode, Map<ValuationSourceId, Valuation>>();
    for (const code of codes) result.set(code, new Map());

    const perSource = await Promise.all(
      sources.map(async (source) => {
        try {
          const vals = await this.fetchFrom(source, codes);
          return { source, vals };
        } catch {
          return { source, vals: [] as Valuation[] };
        }
      }),
    );

    for (const { source, vals } of perSource) {
      for (const v of vals) {
        result.get(v.fundCode)?.set(source, v);
      }
    }
    return result;
  }
}
