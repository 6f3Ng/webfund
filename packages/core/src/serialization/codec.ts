import type { Portfolio, StrategySet } from '../domain';
import { generateId } from '../utils/id';
import { encodeBase64, decodeBase64 } from './base64';
import { ImportError } from './errors';
import { validatePortfolio, validateStrategySet } from './validate';
import { migratePortfolio, migrateStrategySet } from './migrate';

/** Magic header，用于识别导出内容的类型与格式版本 */
export const PORTFOLIO_HEADER = 'FUNDPF1:';
export const STRATEGY_SET_HEADER = 'FUNDSS1:';

/** 导出持仓集合为可复制的字符串 */
export function exportPortfolio(portfolio: Portfolio): string {
  return PORTFOLIO_HEADER + encodeBase64(portfolio);
}

/** 导出策略集为可复制的字符串 */
export function exportStrategySet(set: StrategySet): string {
  return STRATEGY_SET_HEADER + encodeBase64(set);
}

function stripHeader(input: string, header: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith(header)) {
    throw new ImportError('BAD_HEADER', `内容标识不匹配，期望以 ${header} 开头`);
  }
  return trimmed.slice(header.length);
}

function decodePayload<T>(b64: string): T {
  try {
    return decodeBase64<T>(b64);
  } catch (e) {
    throw new ImportError('DECODE_FAILED', `解码失败：${(e as Error).message}`);
  }
}

export interface ImportOptions {
  /** 已存在的名称集合，用于重名检测 */
  existingNames?: Set<string>;
  /** 是否生成新 id（导入时默认 true，避免覆盖同 id 实体） */
  assignNewId?: boolean;
}

/** 重名时追加"(副本)"或序号 */
function resolveName(name: string, existing?: Set<string>): string {
  if (!existing || !existing.has(name)) return name;
  let candidate = `${name} (副本)`;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${name} (副本${n})`;
    n++;
  }
  return candidate;
}

/** 导入持仓集合：解码 → 迁移 → 校验 → 重名/新 id 处理 */
export function importPortfolio(input: string, options: ImportOptions = {}): Portfolio {
  const b64 = stripHeader(input, PORTFOLIO_HEADER);
  const raw = decodePayload<Record<string, unknown>>(b64);
  const migrated = migratePortfolio(raw);
  const portfolio = validatePortfolio(migrated);

  portfolio.name = resolveName(portfolio.name, options.existingNames);
  if (options.assignNewId !== false) {
    portfolio.id = generateId('pf');
  }
  return portfolio;
}

/** 导入策略集 */
export function importStrategySet(input: string, options: ImportOptions = {}): StrategySet {
  const b64 = stripHeader(input, STRATEGY_SET_HEADER);
  const raw = decodePayload<Record<string, unknown>>(b64);
  const migrated = migrateStrategySet(raw);
  const set = validateStrategySet(migrated);

  set.name = resolveName(set.name, options.existingNames);
  if (options.assignNewId !== false) {
    set.id = generateId('ss');
  }
  return set;
}

/** 探测导入字符串的类型 */
export function detectImportType(input: string): 'portfolio' | 'strategySet' | 'unknown' {
  const trimmed = input.trim();
  if (trimmed.startsWith(PORTFOLIO_HEADER)) return 'portfolio';
  if (trimmed.startsWith(STRATEGY_SET_HEADER)) return 'strategySet';
  return 'unknown';
}
