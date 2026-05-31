import { describe, it, expect } from 'vitest';
import { MemoryStorageAdapter } from './adapter';
import {
  PortfolioRepository,
  StrategySetRepository,
  SettingsRepository,
  DEFAULT_SETTINGS,
} from './repository';
import { estimateUsage, willExceedLimit, byteLength } from './capacity';
import { createPortfolio } from '../trading/portfolio-factory';
import { createStrategySet } from '../strategy/factory';

describe('PortfolioRepository', () => {
  it('保存/读取/列举/删除', () => {
    const repo = new PortfolioRepository(new MemoryStorageAdapter());
    const a = createPortfolio({ name: 'A', initialCash: 1000, id: 'a' });
    const b = createPortfolio({ name: 'B', initialCash: 2000, id: 'b' });
    repo.save(a);
    repo.save(b);

    expect(repo.listIds()).toEqual(['a', 'b']);
    expect(repo.listAll()).toHaveLength(2);
    expect(repo.get('a')?.name).toBe('A');

    repo.remove('a');
    expect(repo.listIds()).toEqual(['b']);
    expect(repo.get('a')).toBeNull();
  });

  it('重复保存同 id 不重复入索引', () => {
    const repo = new PortfolioRepository(new MemoryStorageAdapter());
    const a = createPortfolio({ name: 'A', initialCash: 1000, id: 'a' });
    repo.save(a);
    a.cash = 500;
    repo.save(a);
    expect(repo.listIds()).toEqual(['a']);
    expect(repo.get('a')?.cash).toBe(500);
  });

  it('existingNames 用于重名检测', () => {
    const repo = new PortfolioRepository(new MemoryStorageAdapter());
    repo.save(createPortfolio({ name: '组合1', initialCash: 1000, id: 'a' }));
    expect(repo.existingNames().has('组合1')).toBe(true);
  });

  it('容忍损坏的 JSON', () => {
    const adapter = new MemoryStorageAdapter();
    adapter.setItem('fund.portfolios.index', '["a"]');
    adapter.setItem('fund.portfolio.a', '{ broken json');
    const repo = new PortfolioRepository(adapter);
    expect(repo.get('a')).toBeNull();
    expect(repo.listAll()).toHaveLength(0);
  });
});

describe('StrategySetRepository', () => {
  it('保存/读取/删除', () => {
    const repo = new StrategySetRepository(new MemoryStorageAdapter());
    const s = createStrategySet({ name: 'S', id: 's' });
    repo.save(s);
    expect(repo.get('s')?.name).toBe('S');
    repo.remove('s');
    expect(repo.listIds()).toEqual([]);
  });
});

describe('SettingsRepository', () => {
  it('默认值 + 合并保存', () => {
    const repo = new SettingsRepository(new MemoryStorageAdapter());
    expect(repo.get()).toEqual(DEFAULT_SETTINGS);
    repo.save({ ...DEFAULT_SETTINGS, refreshIntervalSec: 30 });
    expect(repo.get().refreshIntervalSec).toBe(30);
  });
});

describe('capacity', () => {
  it('byteLength 计算 UTF-8 字节', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('中')).toBe(3); // 中文 3 字节
    expect(byteLength('😀')).toBe(4); // emoji 4 字节
  });

  it('estimateUsage 统计 fund.* 占用', () => {
    const adapter = new MemoryStorageAdapter();
    adapter.setItem('fund.test', 'x'.repeat(100));
    adapter.setItem('other.key', 'y'.repeat(100)); // 不计入
    const usage = estimateUsage(adapter);
    expect(usage.usedBytes).toBeGreaterThanOrEqual(100);
    expect(usage.usedBytes).toBeLessThan(200);
    expect(usage.nearLimit).toBe(false);
  });

  it('willExceedLimit 预估超限', () => {
    const adapter = new MemoryStorageAdapter();
    const huge = 'x'.repeat(6 * 1024 * 1024);
    expect(willExceedLimit(adapter, 'fund.big', huge)).toBe(true);
    expect(willExceedLimit(adapter, 'fund.small', 'tiny')).toBe(false);
  });
});
