import type { ConflictPolicy, FundCode } from '../domain';
import type { StrategyAction } from './types';
import { roundAmount, roundShares } from '../utils/decimal';

/**
 * 按冲突策略归并同一交易日的动作。
 * - mergeSameDirection：同基金同方向合并（金额/份额相加；比例卖出合并取上限 1）。
 * - sellBeforeBuy：返回顺序保证卖出在前（释放现金供买入）。
 */
export function mergeActions(
  actions: StrategyAction[],
  policy: ConflictPolicy,
): StrategyAction[] {
  if (actions.length === 0) return [];

  let buys = actions.filter((a) => a.side === 'BUY');
  let sells = actions.filter((a) => a.side === 'SELL');

  if (policy.mergeSameDirection) {
    buys = mergeByFund(buys, 'BUY');
    sells = mergeByFund(sells, 'SELL');
  }

  return policy.sellBeforeBuy ? [...sells, ...buys] : [...buys, ...sells];
}

function mergeByFund(actions: StrategyAction[], side: 'BUY' | 'SELL'): StrategyAction[] {
  const byFund = new Map<FundCode, StrategyAction>();
  for (const a of actions) {
    const existing = byFund.get(a.fundCode);
    if (!existing) {
      byFund.set(a.fundCode, { ...a });
      continue;
    }
    if (side === 'BUY') {
      existing.amount = roundAmount((existing.amount ?? 0) + (a.amount ?? 0));
      existing.reason = `${existing.reason}; ${a.reason}`;
    } else {
      // 卖出：份额相加；若任一为比例则比例相加（上限 1），且优先按比例
      if (existing.ratio !== undefined || a.ratio !== undefined) {
        existing.ratio = Math.min(1, (existing.ratio ?? 0) + (a.ratio ?? 0));
        // 若混合了绝对份额，转为按比例为主（绝对份额并入由引擎按比例执行）
        existing.shares = roundShares((existing.shares ?? 0) + (a.shares ?? 0));
      } else {
        existing.shares = roundShares((existing.shares ?? 0) + (a.shares ?? 0));
      }
      existing.reason = `${existing.reason}; ${a.reason}`;
    }
  }
  return [...byFund.values()];
}
