import { PORTFOLIO_SCHEMA_VERSION } from '../domain/constants';
import type { Portfolio, Position } from '../domain';
import { generateId } from '../utils/id';
import { roundAmount, roundShares, roundNav } from '../utils/decimal';

/** 新建集合时配置的现有持仓 */
export interface InitialPosition {
  fundCode: string;
  /** 持有份额 */
  shares: number;
  /** 持仓成本单价（每份成本，精确到 4 位小数） */
  costPrice: number;
  /** 买入日期 YYYY-MM-DD（用于赎回费持有天数计算），默认创建日 */
  acquiredDate?: string;
}

/** 创建一个持仓集合，可选配置现有持仓。
 *
 * 语义：`initialCash` 为初始可用现金；若配置了现有持仓，其成本计入"初始总投入"基准
 * （即 initialCash 字段 = 可用现金 + 持仓总成本），以保证收益计算口径正确：
 * 总收益 = 总资产 − 初始总投入。
 */
export function createPortfolio(params: {
  name: string;
  initialCash: number;
  id?: string;
  createdAt?: string;
  positions?: InitialPosition[];
}): Portfolio {
  if (params.initialCash < 0) throw new Error('初始资金不能为负');

  const createdAt = params.createdAt ?? new Date().toISOString();
  const acquiredDefault = createdAt.slice(0, 10);

  const positions: Position[] = [];
  let positionsCost = 0;
  for (const ip of params.positions ?? []) {
    if (!ip.fundCode || ip.shares <= 0) continue;
    if (ip.costPrice < 0) throw new Error('持仓成本单价不能为负');
    const shares = roundShares(ip.shares);
    const costPrice = roundNav(ip.costPrice); // 成本单价精确到 4 位
    const cost = roundAmount(shares * costPrice); // 总成本由份额 × 单价推导
    positions.push({
      fundCode: ip.fundCode,
      shares,
      availableShares: shares,
      cost,
      lots: [{ acquiredDate: ip.acquiredDate ?? acquiredDefault, shares, nav: costPrice }],
    });
    positionsCost += cost;
  }

  return {
    id: params.id ?? generateId('pf'),
    name: params.name,
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    createdAt,
    // 初始总投入基准 = 可用现金 + 现有持仓成本
    initialCash: roundAmount(params.initialCash + positionsCost),
    cash: roundAmount(params.initialCash),
    positions,
    transactions: [],
    pendingOrders: [],
    pendingCash: [],
    pendingShares: [],
    settings: {},
  };
}

/** 查找或创建持仓 */
export function getOrCreatePosition(portfolio: Portfolio, fundCode: string): Position {
  let pos = portfolio.positions.find((p) => p.fundCode === fundCode);
  if (!pos) {
    pos = { fundCode, shares: 0, availableShares: 0, cost: 0, lots: [] };
    portfolio.positions.push(pos);
  }
  return pos;
}

/** 移除空持仓（份额为 0） */
export function pruneEmptyPositions(portfolio: Portfolio): void {
  portfolio.positions = portfolio.positions.filter((p) => p.shares > 1e-8);
}
