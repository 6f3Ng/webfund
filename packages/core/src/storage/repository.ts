import type { Portfolio, StrategySet } from '../domain';
import type { StorageAdapter } from './adapter';
import { STORAGE_KEYS } from './keys';

/** 读取并解析 JSON，失败返回 fallback */
function readJson<T>(adapter: StorageAdapter, key: string, fallback: T): T {
  const raw = adapter.getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(adapter: StorageAdapter, key: string, value: unknown): void {
  adapter.setItem(key, JSON.stringify(value));
}

/** 应用设置 */
export interface AppSettings {
  /** 默认估值数据源 id */
  defaultValuationSource: string;
  /** 是否交易时段自动刷新 */
  autoRefresh: boolean;
  /** 自动刷新间隔(秒) */
  refreshIntervalSec: number;
  /** 默认申购费率 */
  defaultPurchaseFeeRate: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultValuationSource: 'eastmoney',
  autoRefresh: false,
  refreshIntervalSec: 60,
  defaultPurchaseFeeRate: 0.015,
};

/** 持仓集合仓储 */
export class PortfolioRepository {
  constructor(private readonly adapter: StorageAdapter) {}

  listIds(): string[] {
    return readJson<string[]>(this.adapter, STORAGE_KEYS.portfolioIndex, []);
  }

  listAll(): Portfolio[] {
    return this.listIds()
      .map((id) => this.get(id))
      .filter((p): p is Portfolio => p !== null);
  }

  get(id: string): Portfolio | null {
    return readJson<Portfolio | null>(this.adapter, STORAGE_KEYS.portfolio(id), null);
  }

  save(portfolio: Portfolio): void {
    writeJson(this.adapter, STORAGE_KEYS.portfolio(portfolio.id), portfolio);
    const ids = this.listIds();
    if (!ids.includes(portfolio.id)) {
      ids.push(portfolio.id);
      writeJson(this.adapter, STORAGE_KEYS.portfolioIndex, ids);
    }
  }

  remove(id: string): void {
    this.adapter.removeItem(STORAGE_KEYS.portfolio(id));
    writeJson(
      this.adapter,
      STORAGE_KEYS.portfolioIndex,
      this.listIds().filter((x) => x !== id),
    );
  }

  /** 已存在的集合名称集合（用于导入重名检测） */
  existingNames(): Set<string> {
    return new Set(this.listAll().map((p) => p.name));
  }
}

/** 策略集仓储 */
export class StrategySetRepository {
  constructor(private readonly adapter: StorageAdapter) {}

  listIds(): string[] {
    return readJson<string[]>(this.adapter, STORAGE_KEYS.strategySetIndex, []);
  }

  listAll(): StrategySet[] {
    return this.listIds()
      .map((id) => this.get(id))
      .filter((s): s is StrategySet => s !== null);
  }

  get(id: string): StrategySet | null {
    return readJson<StrategySet | null>(this.adapter, STORAGE_KEYS.strategySet(id), null);
  }

  save(set: StrategySet): void {
    writeJson(this.adapter, STORAGE_KEYS.strategySet(set.id), set);
    const ids = this.listIds();
    if (!ids.includes(set.id)) {
      ids.push(set.id);
      writeJson(this.adapter, STORAGE_KEYS.strategySetIndex, ids);
    }
  }

  remove(id: string): void {
    this.adapter.removeItem(STORAGE_KEYS.strategySet(id));
    writeJson(
      this.adapter,
      STORAGE_KEYS.strategySetIndex,
      this.listIds().filter((x) => x !== id),
    );
  }

  existingNames(): Set<string> {
    return new Set(this.listAll().map((s) => s.name));
  }
}

/** 设置仓储 */
export class SettingsRepository {
  constructor(private readonly adapter: StorageAdapter) {}

  get(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(this.adapter, STORAGE_KEYS.settings, {}) };
  }

  save(settings: AppSettings): void {
    writeJson(this.adapter, STORAGE_KEYS.settings, settings);
  }
}
