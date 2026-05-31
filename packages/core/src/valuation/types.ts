import type { FundCode } from '../domain';

export type ValuationSourceId = 'eastmoney' | 'danjuan' | 'self-calc';

/** 标准化估值（与 Workers DTO 对齐） */
export interface Valuation {
  fundCode: FundCode;
  name?: string;
  source: ValuationSourceId;
  estimatedNav: number;
  estimatedGrowthPct: number;
  estimatedAt: string;
  baseNav?: number;
  baseNavDate?: string;
  /** 自建估值覆盖率 0~1 */
  confidence?: number;
  /** 该基金该源是否获取失败 */
  error?: string;
}

/**
 * 估值数据源。核心库只定义接口与聚合逻辑，
 * 实际网络获取由 Web/小程序注入的实现（调用 Workers）提供，保持核心库无网络依赖。
 */
export interface ValuationProvider {
  id: ValuationSourceId;
  name: string;
  getValuation(codes: FundCode[]): Promise<Valuation[]>;
}

/** 数据源元信息（用于 UI 展示选择） */
export interface ValuationSourceMeta {
  id: ValuationSourceId;
  name: string;
  /** 是否为盘中实时估算 */
  intraday: boolean;
  description: string;
}

export const VALUATION_SOURCES: ValuationSourceMeta[] = [
  {
    id: 'eastmoney',
    name: '天天基金',
    intraday: true,
    description: '东方财富盘中实时估值（非官方推算）',
  },
  {
    id: 'danjuan',
    name: '蛋卷基金',
    intraday: false,
    description: '蛋卷最近确认净值（公开接口，用于对比/容灾）',
  },
  {
    id: 'self-calc',
    name: '自建估算',
    intraday: true,
    description: '基于公开持仓加权 + 沪深300补全未覆盖仓位（季报滞后，附覆盖率）',
  },
];
