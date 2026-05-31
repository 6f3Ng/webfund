import { STRATEGY_SET_SCHEMA_VERSION } from '../domain/constants';
import { DEFAULT_CONFLICT_POLICY, type StrategySet } from '../domain';
import { generateId } from '../utils/id';

/** 创建空策略集 */
export function createStrategySet(params: {
  name: string;
  id?: string;
  createdAt?: string;
}): StrategySet {
  return {
    id: params.id ?? generateId('ss'),
    name: params.name,
    schemaVersion: STRATEGY_SET_SCHEMA_VERSION,
    createdAt: params.createdAt ?? new Date().toISOString(),
    strategies: [],
    conflictPolicy: { ...DEFAULT_CONFLICT_POLICY },
  };
}
