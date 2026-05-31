import type { Portfolio, Position, FundCode } from '../domain';
import { roundAmount, roundRate } from '../utils/decimal';

/** 单只持仓的盈亏快照 */
export interface PositionSnapshot {
  fundCode: FundCode;
  shares: number;
  availableShares: number;
  cost: number;
  /** 估值/最新净值 */
  nav: number;
  /** 持仓市值 */
  marketValue: number;
  /** 持仓收益（市值 - 成本） */
  profit: number;
  /** 收益率 */
  profitRate: number;
  /** 当日盈亏（份额 × (nav - prevNav)） */
  dayProfit: number;
}

/** 组合整体快照 */
export interface PortfolioSnapshot {
  /** 持仓市值合计 */
  marketValue: number;
  /** 可用现金 */
  cash: number;
  /** 在途资金合计 */
  pendingCash: number;
  /** 总资产 = 现金 + 在途资金 + 持仓市值 */
  totalAssets: number;
  /** 总成本（按初始资金口径：总收益 = 总资产 - 初始资金） */
  totalProfit: number;
  totalProfitRate: number;
  /** 当日盈亏合计 */
  dayProfit: number;
  positions: PositionSnapshot[];
}

/** 价格输入：当前估值/净值 与 上一交易日净值（用于当日盈亏） */
export interface PriceInput {
  nav: number;
  prevNav?: number;
}
export type PriceMap = Record<FundCode, PriceInput>;

export function snapshotPosition(pos: Position, price: PriceInput): PositionSnapshot {
  const nav = price.nav;
  const marketValue = roundAmount(pos.shares * nav);
  const profit = roundAmount(marketValue - pos.cost);
  const profitRate = pos.cost > 0 ? roundRate(profit / pos.cost) : 0;
  const prevNav = price.prevNav ?? nav;
  const dayProfit = roundAmount(pos.shares * (nav - prevNav));
  return {
    fundCode: pos.fundCode,
    shares: pos.shares,
    availableShares: pos.availableShares,
    cost: pos.cost,
    nav,
    marketValue,
    profit,
    profitRate,
    dayProfit,
  };
}

/**
 * 计算组合快照。
 * 当某持仓缺少价格（估值未加载/数据源失败）时，回退使用其平均成本作为净值，
 * 即按"盈亏为 0"处理，避免把未估值持仓错算成 −100% 亏损导致总收益/收益率失真。
 */
export function snapshotPortfolio(portfolio: Portfolio, prices: PriceMap): PortfolioSnapshot {
  const positions = portfolio.positions.map((pos) => {
    const provided = prices[pos.fundCode];
    // 缺价回退：用平均成本作为净值（盈亏 0）
    const fallbackNav = pos.shares > 0 ? pos.cost / pos.shares : 0;
    const price: PriceInput = provided ?? { nav: fallbackNav };
    return snapshotPosition(pos, price);
  });

  const marketValue = roundAmount(positions.reduce((acc, p) => acc + p.marketValue, 0));
  const pendingCash = roundAmount(portfolio.pendingCash.reduce((acc, p) => acc + p.amount, 0));
  const dayProfit = roundAmount(positions.reduce((acc, p) => acc + p.dayProfit, 0));
  const totalAssets = roundAmount(portfolio.cash + pendingCash + marketValue);
  const totalProfit = roundAmount(totalAssets - portfolio.initialCash);
  const totalProfitRate =
    portfolio.initialCash > 0 ? roundRate(totalProfit / portfolio.initialCash) : 0;

  return {
    marketValue,
    cash: portfolio.cash,
    pendingCash,
    totalAssets,
    totalProfit,
    totalProfitRate,
    dayProfit,
    positions,
  };
}
