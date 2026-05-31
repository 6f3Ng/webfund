import { describe, it, expect } from 'vitest';
import { migratePortfolio, migrateStrategySet } from './migrate';
import { ImportError } from './errors';
import { PORTFOLIO_SCHEMA_VERSION } from '../domain/constants';

describe('migrate', () => {
  it('当前版本数据原样通过', () => {
    const data = { schemaVersion: PORTFOLIO_SCHEMA_VERSION, name: 'x' };
    const out = migratePortfolio(data);
    expect(out.schemaVersion).toBe(PORTFOLIO_SCHEMA_VERSION);
  });

  it('低版本（无迁移步骤）自动提升版本号', () => {
    const data = { schemaVersion: 0, name: 'x' };
    const out = migratePortfolio(data);
    expect(out.schemaVersion).toBe(PORTFOLIO_SCHEMA_VERSION);
  });

  it('高于支持版本抛 UNSUPPORTED_VERSION', () => {
    const data = { schemaVersion: 999, name: 'x' };
    try {
      migratePortfolio(data);
      throw new Error('应当抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).code).toBe('UNSUPPORTED_VERSION');
    }
  });

  it('策略集迁移同理', () => {
    expect(migrateStrategySet({ schemaVersion: 0 }).schemaVersion).toBeGreaterThanOrEqual(1);
  });
});
