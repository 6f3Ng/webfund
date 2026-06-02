import { describe, it, expect } from 'vitest';
import type { Strategy, StrategyAction } from '@fund/core';
import { collectStrategyCodes, describeAction } from './strategyExecutionService';

function strat(over: Partial<Strategy>): Strategy {
  return {
    id: 's',
    name: 'x',
    templateType: 'DCA',
    fundCode: '000001',
    params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: 1, amount: 1000 },
    enabled: true,
    ...over,
  };
}

describe('collectStrategyCodes', () => {
  it('仅收集启用策略的去重标的', () => {
    const list = [
      strat({ id: 'a', fundCode: '000001', enabled: true }),
      strat({ id: 'b', fundCode: '000001', enabled: true }),
      strat({ id: 'c', fundCode: '161725', enabled: true }),
      strat({ id: 'd', fundCode: '110011', enabled: false }),
    ];
    expect(collectStrategyCodes(list).sort()).toEqual(['000001', '161725']);
  });
});

describe('describeAction', () => {
  it('买入展示金额', () => {
    const a: StrategyAction = { strategyId: 's', fundCode: '000001', side: 'BUY', amount: 2000, reason: '' };
    expect(describeAction(a)).toContain('买入 ¥2000.00');
  });

  it('比例卖出展示百分比', () => {
    const a: StrategyAction = { strategyId: 's', fundCode: '000001', side: 'SELL', ratio: 0.5, reason: '' };
    expect(describeAction(a)).toContain('卖出 50% 份额');
  });

  it('金额卖出按净值换算份额展示', () => {
    const a: StrategyAction = { strategyId: 's', fundCode: '000001', side: 'SELL', amount: 1000, reason: '' };
    expect(describeAction(a, 2)).toContain('≈500.00 份');
  });

  it('份额卖出展示份额', () => {
    const a: StrategyAction = { strategyId: 's', fundCode: '000001', side: 'SELL', shares: 123.4567, reason: '' };
    expect(describeAction(a)).toContain('卖出 123.46 份');
  });
});
