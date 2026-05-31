import { describe, it, expect } from 'vitest';
import { mergeActions } from './conflict';
import { DEFAULT_CONFLICT_POLICY } from '../domain';
import type { StrategyAction } from './types';

const buy = (fund: string, amount: number, id = 's'): StrategyAction => ({
  strategyId: id,
  fundCode: fund,
  side: 'BUY',
  amount,
  reason: 'buy',
});
const sell = (fund: string, ratio: number, id = 's'): StrategyAction => ({
  strategyId: id,
  fundCode: fund,
  side: 'SELL',
  ratio,
  reason: 'sell',
});

describe('mergeActions', () => {
  it('先卖后买', () => {
    const result = mergeActions([buy('A', 100), sell('A', 0.5)], DEFAULT_CONFLICT_POLICY);
    expect(result[0].side).toBe('SELL');
    expect(result[1].side).toBe('BUY');
  });

  it('同基金同向买入合并金额', () => {
    const result = mergeActions(
      [buy('A', 100, 's1'), buy('A', 200, 's2')],
      DEFAULT_CONFLICT_POLICY,
    );
    const buys = result.filter((a) => a.side === 'BUY');
    expect(buys).toHaveLength(1);
    expect(buys[0].amount).toBe(300);
  });

  it('同基金同向卖出比例合并（上限1）', () => {
    const result = mergeActions([sell('A', 0.6), sell('A', 0.7)], DEFAULT_CONFLICT_POLICY);
    const sells = result.filter((a) => a.side === 'SELL');
    expect(sells).toHaveLength(1);
    expect(sells[0].ratio).toBe(1);
  });

  it('不合并时保留所有动作', () => {
    const result = mergeActions([buy('A', 100, 's1'), buy('A', 200, 's2')], {
      sellBeforeBuy: true,
      mergeSameDirection: false,
    });
    expect(result).toHaveLength(2);
  });

  it('空输入返回空', () => {
    expect(mergeActions([], DEFAULT_CONFLICT_POLICY)).toEqual([]);
  });

  it('sellBeforeBuy=false 时买在前', () => {
    const result = mergeActions([sell('A', 0.5), buy('B', 100)], {
      sellBeforeBuy: false,
      mergeSameDirection: true,
    });
    expect(result[0].side).toBe('BUY');
  });
});
