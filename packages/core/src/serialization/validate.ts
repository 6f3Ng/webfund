import type { Portfolio, StrategySet, Strategy, StrategyParams } from '../domain';
import { ImportError } from './errors';

function fail(msg: string): never {
  throw new ImportError('VALIDATION_FAILED', msg);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isArr(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/** 校验并规整 Portfolio（容忍缺失的可选数组，补默认值） */
export function validatePortfolio(data: unknown): Portfolio {
  if (!isObj(data)) fail('持仓集合不是对象');
  const d = data as Record<string, unknown>;
  if (!isStr(d.id)) fail('缺少 id');
  if (!isStr(d.name)) fail('缺少 name');
  if (!isNum(d.schemaVersion)) fail('缺少 schemaVersion');
  if (!isNum(d.initialCash)) fail('缺少 initialCash');
  if (!isNum(d.cash)) fail('缺少 cash');
  if (!isArr(d.positions)) fail('positions 必须是数组');
  if (!isArr(d.transactions)) fail('transactions 必须是数组');

  for (const p of d.positions as unknown[]) {
    if (!isObj(p) || !isStr(p.fundCode) || !isNum(p.shares)) fail('持仓项字段非法');
  }

  return {
    id: d.id,
    name: d.name,
    schemaVersion: d.schemaVersion,
    createdAt: isStr(d.createdAt) ? d.createdAt : new Date().toISOString(),
    initialCash: d.initialCash,
    cash: d.cash,
    positions: d.positions as Portfolio['positions'],
    transactions: d.transactions as Portfolio['transactions'],
    pendingOrders: isArr(d.pendingOrders) ? (d.pendingOrders as Portfolio['pendingOrders']) : [],
    pendingCash: isArr(d.pendingCash) ? (d.pendingCash as Portfolio['pendingCash']) : [],
    pendingShares: isArr(d.pendingShares) ? (d.pendingShares as Portfolio['pendingShares']) : [],
    settings: isObj(d.settings) ? (d.settings as Portfolio['settings']) : {},
  };
}

const VALID_TEMPLATES = new Set([
  'DCA',
  'BASE_POSITION',
  'SMART_DCA_CHANGE',
  'SMART_DCA_MA',
  'VALUE_AVERAGING',
  'THRESHOLD_BUY',
  'THRESHOLD_SELL',
  'TAKE_PROFIT',
  'SMART_TAKE_PROFIT',
  'STOP_LOSS',
  'GRID',
]);

function validateStrategy(data: unknown): Strategy {
  if (!isObj(data)) fail('策略不是对象');
  const d = data as Record<string, unknown>;
  if (!isStr(d.id)) fail('策略缺少 id');
  if (!isStr(d.name)) fail('策略缺少 name');
  if (!isStr(d.templateType) || !VALID_TEMPLATES.has(d.templateType)) fail('策略 templateType 非法');
  if (!isStr(d.fundCode)) fail('策略缺少 fundCode');
  if (!isObj(d.params)) fail('策略缺少 params');
  if ((d.params as Record<string, unknown>).type !== d.templateType) fail('策略 params.type 与模板不一致');
  return {
    id: d.id,
    name: d.name,
    templateType: d.templateType as Strategy['templateType'],
    fundCode: d.fundCode,
    params: d.params as unknown as StrategyParams,
    enabled: typeof d.enabled === 'boolean' ? d.enabled : true,
  };
}

/** 校验并规整 StrategySet */
export function validateStrategySet(data: unknown): StrategySet {
  if (!isObj(data)) fail('策略集不是对象');
  const d = data as Record<string, unknown>;
  if (!isStr(d.id)) fail('缺少 id');
  if (!isStr(d.name)) fail('缺少 name');
  if (!isNum(d.schemaVersion)) fail('缺少 schemaVersion');
  if (!isArr(d.strategies)) fail('strategies 必须是数组');

  const strategies = (d.strategies as unknown[]).map(validateStrategy);
  const cp = isObj(d.conflictPolicy) ? (d.conflictPolicy as Record<string, unknown>) : {};

  return {
    id: d.id,
    name: d.name,
    schemaVersion: d.schemaVersion,
    createdAt: isStr(d.createdAt) ? d.createdAt : new Date().toISOString(),
    strategies,
    conflictPolicy: {
      sellBeforeBuy: typeof cp.sellBeforeBuy === 'boolean' ? cp.sellBeforeBuy : true,
      mergeSameDirection: typeof cp.mergeSameDirection === 'boolean' ? cp.mergeSameDirection : true,
    },
  };
}
