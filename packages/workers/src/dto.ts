/** Workers 对外标准化 DTO。前端只见这些结构，各数据源差异在 Workers 内消化。 */

export type ValuationSourceId = 'eastmoney' | 'danjuan' | 'self-calc';

/** 标准化估值 */
export interface ValuationDTO {
  fundCode: string;
  name?: string;
  source: ValuationSourceId;
  /** 估算净值 */
  estimatedNav: number;
  /** 估算涨跌幅 %（如 -3.41 表示跌 3.41%） */
  estimatedGrowthPct: number;
  /** 估值时间（数据源给出的时间字符串） */
  estimatedAt: string;
  /** 上一交易日单位净值 */
  baseNav?: number;
  /** 上一交易日日期 */
  baseNavDate?: string;
  /** 自建估值覆盖率（0~1），仅 self-calc 提供 */
  confidence?: number;
  /** 该基金估值获取失败时的错误信息（批量接口中用于单基金降级，整体仍返回 200） */
  error?: string;
}

/** 标准化历史净值点 */
export interface NavPointDTO {
  date: string; // YYYY-MM-DD
  nav: number; // 单位净值
  accNav?: number; // 累计净值
  growthPct?: number; // 当日涨跌幅 %
}

/** 标准化个股实时行情 */
export interface QuoteDTO {
  symbol: string; // 如 sh600519
  name?: string;
  price: number; // 现价
  prevClose: number; // 昨收
  growthPct: number; // 涨跌幅 %
  time?: string;
}

/** 基金基础信息 */
export interface FundInfoDTO {
  code: string;
  name: string;
  type?: string;
}

/** 基金持仓个股 */
export interface HoldingDTO {
  symbol: string; // 标准化股票代码，如 sh600519
  name: string;
  /** 占净值比例 %（如 8.5） */
  weightPct: number;
}

export interface FundHoldingsDTO {
  fundCode: string;
  /** 持仓披露报告期，如 2024-09-30 */
  reportDate?: string;
  holdings: HoldingDTO[];
  /** 重仓股合计权重 % */
  totalWeightPct: number;
}
