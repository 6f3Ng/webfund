/**
 * 持仓明细纯助手模块
 *
 * 提供首页持仓明细表所需的纯函数：
 * - `resolveDisplayName`：基金名称解析（本地名称表 → getCachedFundName → 回退 6 位代码）
 * - 各列取值函数：与单元格渲染同源，缺失值统一映射为 `-Infinity`
 * - `sortByValue` / `sortByName`：确定性全序比较器，供 AntD Table 列排序使用
 *
 * 所有函数均为纯函数（无副作用、无模块级状态），便于单元/属性测试。
 */
import type { PortfolioSnapshot, Position } from '@fund/core';
import type { DisplayQuote } from '@/stores/valuationStore';

/** 缺失值标记：升序时聚集在最前、降序时聚集在最后（确定性次序，需求 5.4） */
const MISSING = -Infinity;

/**
 * 解析基金展示名称（需求 4.3、4.4）。
 *
 * 优先级：本地名称表 `names[code]` → `getCached(code)` → 回退为 6 位代码本身。
 *
 * @param code      6 位基金代码
 * @param names     本地名称表（展示层维护，预取回填后触发重渲染）
 * @param getCached 名称缓存读取器（通常为 `fundInfoService.getCachedFundName`）
 */
export function resolveDisplayName(
  code: string,
  names: Record<string, string>,
  getCached: (code: string) => string | undefined,
): string {
  return names[code] ?? getCached(code) ?? code;
}

/** 排序取值上下文：与单元格渲染完全相同的数据来源（需求 5.3） */
export interface HoldingsSortContext {
  /** fundCode -> 展示行情 */
  quotes: Record<string, DisplayQuote>;
  /** 组合快照（含每持仓 marketValue/profit），未加载时为 null */
  snap: PortfolioSnapshot | null;
}

/** 在快照中按基金代码查找持仓快照项 */
function findSnapshot(snap: PortfolioSnapshot | null, code: string) {
  return snap?.positions.find((p) => p.fundCode === code);
}

/* ------------------------------------------------------------------ *
 * 各列取值函数：来源 quotes[code] / snap.positions / Position
 * 缺失（无行情、nav<=0、无快照）统一返回 MISSING(-Infinity)
 * ------------------------------------------------------------------ */

/** 净值/估值列：来源 `quotes[code]`（需求 5.3） */
export function navValue(r: Position, ctx: HoldingsSortContext): number {
  const q = ctx.quotes[r.fundCode];
  return q && q.nav > 0 ? q.nav : MISSING;
}

/** 当日涨跌/估算涨跌列：来源 `quotes[code]` */
export function growthValue(r: Position, ctx: HoldingsSortContext): number {
  const q = ctx.quotes[r.fundCode];
  return q && q.nav > 0 ? q.growthPct : MISSING;
}

/** 持有份额列：来源 `Position`（始终有值） */
export function sharesValue(r: Position): number {
  return r.shares;
}

/** 可卖份额列：来源 `Position`（始终有值） */
export function availableSharesValue(r: Position): number {
  return r.availableShares;
}

/** 成本单价列：来源 `Position`，无份额时缺失 */
export function costPriceValue(r: Position): number {
  return r.shares > 0 ? r.cost / r.shares : MISSING;
}

/** 成本列：来源 `Position`（始终有值） */
export function costValue(r: Position): number {
  return r.cost;
}

/** 市值列：来源 `snap.positions`（PositionSnapshot.marketValue） */
export function marketValueValue(r: Position, ctx: HoldingsSortContext): number {
  const sp = findSnapshot(ctx.snap, r.fundCode);
  return sp ? sp.marketValue : MISSING;
}

/** 收益列：来源 `snap.positions`（PositionSnapshot.profit） */
export function profitValue(r: Position, ctx: HoldingsSortContext): number {
  const sp = findSnapshot(ctx.snap, r.fundCode);
  return sp ? sp.profit : MISSING;
}

/**
 * 列取值器映射：键与 HomePage 列 `key` 一致，便于按列统一取值与排序（需求 5.3）。
 * 仅含数据列；操作列不排序（需求 5.2）。
 */
export const columnValueGetters: Record<
  'nav' | 'growth' | 'shares' | 'availableShares' | 'costPrice' | 'cost' | 'mv' | 'profit',
  (r: Position, ctx: HoldingsSortContext) => number
> = {
  nav: navValue,
  growth: growthValue,
  shares: (r) => sharesValue(r),
  availableShares: (r) => availableSharesValue(r),
  costPrice: (r) => costPriceValue(r),
  cost: (r) => costValue(r),
  mv: marketValueValue,
  profit: profitValue,
};

/**
 * 数值列全序比较器（需求 5.4）。
 *
 * - 双方缺失（非有限值）：返回 0（视为相等）
 * - 单侧缺失：缺失值固定置于一端（升序时最前）
 * - 否则：数值相减
 *
 * 满足自反、反对称、传递性，相同输入产生相同次序。
 */
export function sortByValue(getVal: (r: Position) => number) {
  return (a: Position, b: Position): number => {
    const va = getVal(a);
    const vb = getVal(b);
    const aMiss = !Number.isFinite(va);
    const bMiss = !Number.isFinite(vb);
    if (aMiss && bMiss) return 0;
    if (aMiss) return -1; // 缺失值固定置于一端
    if (bMiss) return 1;
    return va - vb;
  };
}

/**
 * 基金标识列文本比较器（需求 5.5）。
 *
 * 按解析后的展示名称（名称缺失回退代码）使用 `localeCompare`，保证确定性、稳定的总序。
 * 与单元格渲染同源（同一 `getName`）。
 */
export function sortByName(getName: (r: Position) => string) {
  return (a: Position, b: Position): number => getName(a).localeCompare(getName(b));
}
