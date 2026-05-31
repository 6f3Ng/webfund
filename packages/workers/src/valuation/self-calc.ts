import type { ValuationDTO, FundHoldingsDTO, QuoteDTO } from '../dto';

/** 沪深300 指数 symbol（用于补全未覆盖仓位，决策5） */
export const CSI300_SYMBOL = 'sh000300';

export interface SelfCalcInput {
  fundCode: string;
  holdings: FundHoldingsDTO;
  /** 持仓个股 + 指数 的行情，按 symbol 索引 */
  quotes: Map<string, QuoteDTO>;
  /** 上一交易日基金单位净值（用于换算估算净值） */
  baseNav?: number;
  baseNavDate?: string;
}

/**
 * 自建估值计算：
 *  已覆盖部分涨幅 = Σ(权重 × 个股涨跌幅)
 *  未覆盖部分(1 - Σ权重) 按沪深300 实时涨跌幅补全
 *  基金估算涨跌幅 = 已覆盖加权 + 未覆盖按指数补全
 *  估算净值 = 上一日净值 × (1 + 估算涨跌幅/100)
 *  confidence = Σ覆盖权重
 */
export function computeSelfValuation(input: SelfCalcInput): ValuationDTO {
  const { fundCode, holdings, quotes, baseNav, baseNavDate } = input;

  let coveredWeight = 0; // 累计覆盖权重（小数，如 0.65）
  let weightedGrowth = 0; // Σ(权重小数 × 涨跌幅%)

  for (const h of holdings.holdings) {
    const q = quotes.get(h.symbol);
    if (!q) continue; // 该股行情缺失，跳过（视为未覆盖）
    const w = h.weightPct / 100;
    coveredWeight += w;
    weightedGrowth += w * q.growthPct;
  }

  // 未覆盖部分按沪深300 补全
  const index = quotes.get(CSI300_SYMBOL);
  const uncoveredWeight = Math.max(0, 1 - coveredWeight);
  const indexGrowth = index?.growthPct ?? 0;
  const estimatedGrowthPct = Number(
    (weightedGrowth + uncoveredWeight * indexGrowth).toFixed(4),
  );

  const estimatedNav =
    baseNav != null ? Number((baseNav * (1 + estimatedGrowthPct / 100)).toFixed(4)) : 0;

  return {
    fundCode,
    source: 'self-calc',
    estimatedNav,
    estimatedGrowthPct,
    estimatedAt: new Date().toISOString(),
    baseNav,
    baseNavDate,
    confidence: Number(Math.min(1, coveredWeight).toFixed(4)),
  };
}
