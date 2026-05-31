import {
  PORTFOLIO_SCHEMA_VERSION,
  STRATEGY_SET_SCHEMA_VERSION,
} from '../domain/constants';
import { ImportError } from './errors';

/** 单步迁移函数：将 fromVersion 的数据升级到 fromVersion+1 */
type MigrationStep = (data: Record<string, unknown>) => Record<string, unknown>;

/** Portfolio 迁移表：索引 i 表示从版本 i → i+1。当前只有 v1，无需迁移。 */
const portfolioMigrations: Record<number, MigrationStep> = {
  // 示例：未来 v1 → v2
  // 1: (d) => ({ ...d, schemaVersion: 2, newField: defaultValue }),
};

const strategySetMigrations: Record<number, MigrationStep> = {};

function runMigrations(
  data: Record<string, unknown>,
  migrations: Record<number, MigrationStep>,
  targetVersion: number,
  label: string,
): Record<string, unknown> {
  let cur = data;
  let version = typeof cur.schemaVersion === 'number' ? cur.schemaVersion : 0;

  if (version > targetVersion) {
    throw new ImportError(
      'UNSUPPORTED_VERSION',
      `${label} 版本 ${version} 高于当前支持的 ${targetVersion}，请升级应用`,
    );
  }

  while (version < targetVersion) {
    const step = migrations[version];
    if (!step) {
      // 无迁移步骤但版本落后：直接提升版本号（结构兼容）
      cur = { ...cur, schemaVersion: version + 1 };
    } else {
      cur = step(cur);
    }
    version += 1;
  }
  return cur;
}

export function migratePortfolio(data: Record<string, unknown>): Record<string, unknown> {
  return runMigrations(data, portfolioMigrations, PORTFOLIO_SCHEMA_VERSION, '持仓集合');
}

export function migrateStrategySet(data: Record<string, unknown>): Record<string, unknown> {
  return runMigrations(data, strategySetMigrations, STRATEGY_SET_SCHEMA_VERSION, '策略集');
}
