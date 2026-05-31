import { describe, it, expect } from 'vitest';
import {
  exportPortfolio,
  importPortfolio,
  exportStrategySet,
  importStrategySet,
  detectImportType,
  PORTFOLIO_HEADER,
  STRATEGY_SET_HEADER,
} from './codec';
import { ImportError } from './errors';
import { createPortfolio } from '../trading/portfolio-factory';
import { createStrategySet } from '../strategy/factory';
import type { Strategy } from '../domain';

function samplePortfolio() {
  const pf = createPortfolio({ name: '稳健组合', initialCash: 100000, id: 'pf_fixed' });
  pf.cash = 90000;
  pf.positions.push({
    fundCode: '000001',
    shares: 4926.11,
    availableShares: 4926.11,
    cost: 10000,
    lots: [{ acquiredDate: '2024-06-03', shares: 4926.11, nav: 2.0 }],
  });
  pf.transactions.push({
    id: 'txn1',
    type: 'BUY',
    fundCode: '000001',
    date: '2024-06-03',
    nav: 2.0,
    amount: 10000,
    shares: 4926.11,
    fee: 147.78,
  });
  return pf;
}

function sampleStrategySet() {
  const set = createStrategySet({ name: '定投策略集', id: 'ss_fixed' });
  const dca: Strategy = {
    id: 'st1',
    name: '每月定投',
    templateType: 'DCA',
    fundCode: '000001',
    params: { type: 'DCA', period: 'MONTHLY', dayOfPeriod: 1, amount: 1000 },
    enabled: true,
  };
  set.strategies.push(dca);
  return set;
}

describe('Portfolio 序列化', () => {
  it('导出带 magic header', () => {
    const s = exportPortfolio(samplePortfolio());
    expect(s.startsWith(PORTFOLIO_HEADER)).toBe(true);
  });

  it('编码→解码往返保持数据一致（除 id 重分配）', () => {
    const pf = samplePortfolio();
    const encoded = exportPortfolio(pf);
    const decoded = importPortfolio(encoded, { assignNewId: false });
    expect(decoded).toEqual(pf);
  });

  it('导入默认重分配新 id', () => {
    const pf = samplePortfolio();
    const decoded = importPortfolio(exportPortfolio(pf));
    expect(decoded.id).not.toBe(pf.id);
    expect(decoded.name).toBe(pf.name);
    expect(decoded.positions).toEqual(pf.positions);
  });

  it('重名时生成副本', () => {
    const pf = samplePortfolio();
    const encoded = exportPortfolio(pf);
    const existing = new Set(['稳健组合']);
    const decoded = importPortfolio(encoded, { existingNames: existing });
    expect(decoded.name).toBe('稳健组合 (副本)');

    existing.add('稳健组合 (副本)');
    const decoded2 = importPortfolio(encoded, { existingNames: existing });
    expect(decoded2.name).toBe('稳健组合 (副本2)');
  });

  it('错误 header 抛 BAD_HEADER', () => {
    expect(() => importPortfolio('GARBAGE:xxxx')).toThrow(ImportError);
    try {
      importPortfolio('GARBAGE:xxxx');
    } catch (e) {
      expect((e as ImportError).code).toBe('BAD_HEADER');
    }
  });

  it('损坏的 base64 抛 DECODE_FAILED', () => {
    try {
      importPortfolio(PORTFOLIO_HEADER + '!!!not-valid-base64!!!');
    } catch (e) {
      expect((e as ImportError).code).toBe('DECODE_FAILED');
    }
  });

  it('字段缺失抛 VALIDATION_FAILED', () => {
    // 构造一个 header 正确但内容缺字段的 payload
    const bad = exportPortfolio({ id: 'x', name: 'y' } as never);
    try {
      importPortfolio(bad);
      throw new Error('应当抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).code).toBe('VALIDATION_FAILED');
    }
  });
});

describe('StrategySet 序列化', () => {
  it('往返一致', () => {
    const set = sampleStrategySet();
    const decoded = importStrategySet(exportStrategySet(set), { assignNewId: false });
    expect(decoded).toEqual(set);
  });

  it('header 正确', () => {
    expect(exportStrategySet(sampleStrategySet()).startsWith(STRATEGY_SET_HEADER)).toBe(true);
  });

  it('策略 params.type 与模板不一致时拒绝', () => {
    const set = sampleStrategySet();
    (set.strategies[0].params as { type: string }).type = 'GRID'; // 与 templateType=DCA 不符
    const encoded = exportStrategySet(set);
    try {
      importStrategySet(encoded);
      throw new Error('应当抛错');
    } catch (e) {
      expect((e as ImportError).code).toBe('VALIDATION_FAILED');
    }
  });

  it('重名生成副本', () => {
    const set = sampleStrategySet();
    const decoded = importStrategySet(exportStrategySet(set), {
      existingNames: new Set(['定投策略集']),
    });
    expect(decoded.name).toBe('定投策略集 (副本)');
  });
});

describe('detectImportType', () => {
  it('识别类型', () => {
    expect(detectImportType(exportPortfolio(samplePortfolio()))).toBe('portfolio');
    expect(detectImportType(exportStrategySet(sampleStrategySet()))).toBe('strategySet');
    expect(detectImportType('random text')).toBe('unknown');
  });
});
