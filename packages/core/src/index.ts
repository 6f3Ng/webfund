/**
 * @fund/core — 平台无关的基金核心库
 *
 * - domain:        领域模型与类型 (M1) ✅
 * - utils:         精度/日期/id 工具 (M1) ✅
 * - trading:       场外交易规则引擎 (M1) ✅
 * - storage:       StorageAdapter 接口与仓储 (M2) ✅
 * - serialization: Base64 导入导出与 schema 版本 (M2) ✅
 * - valuation:     估值聚合与 Provider 抽象 (M4) ✅
 * - strategy:      策略定义、策略集、回测引擎 (M6, 当前仅类型与工厂)
 */

export const CORE_VERSION = '0.1.0';

export * from './domain';
export * from './utils';
export * from './trading';
export * from './storage';
export * from './serialization';
export * from './valuation';
export * from './strategy';
