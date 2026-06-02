import type { FundCode, NavPoint, Strategy, ConflictPolicy } from '../domain';
import { dateLte } from '../utils/date';
import { evaluateStrategy } from './evaluators';
import { mergeActions } from './conflict';
import type { DayContext, PositionView, StrategyAction, StrategyRuntimeState } from './types';

/**
 * 实盘（手动）策略执行的输入。
 *
 * 与回测逐日循环不同，手动执行是「对当前模拟持仓在某一时点求值一次」：
 *  - `navData`：每只标的的历史净值（升序）。为使涨跌幅 / 均线 / 阈值类策略正确取值，
 *    序列应包含「今日（date）」这一点，其净值取自持仓页展示的估值（保持口径一致）。
 *  - `positions`：当前已确认持仓视图（用于止盈 / 止损 / 目标市值法等读取成本与份额）。
 *  - `cash`：当前可用现金（买入类策略据此判断是否触发）。
 */
export interface LiveExecInput {
  /** 求值时点（交易日）'YYYY-MM-DD'，通常为今日 */
  date: string;
  /** 启用的策略列表（建议外部已过滤 enabled） */
  strategies: Strategy[];
  /** 标的历史净值，fundCode -> 升序净值序列（应含今日点） */
  navData: Record<FundCode, NavPoint[]>;
  /** 当前持仓视图，fundCode -> { shares, cost } */
  positions: Record<FundCode, { shares: number; cost: number }>;
  /** 可用现金 */
  cash: number;
  /** 冲突归并策略 */
  conflictPolicy: ConflictPolicy;
  /**
   * 已建立底仓的策略 id 集合。命中其中的「底仓（BASE_POSITION）」策略将被视为已建仓、
   * 本次不再触发，避免手动多次执行时底仓重复买入。
   */
  executedBaseStrategyIds?: string[];
}

/** 单条策略的求值诊断（用于预览展示） */
export interface LiveStrategyDiagnostic {
  strategyId: string;
  strategyName: string;
  templateType: Strategy['templateType'];
  fundCode: FundCode;
  enabled: boolean;
  /** 该策略本次是否触发动作 */
  triggered: boolean;
  /** 触发的原始动作（归并前） */
  actions: StrategyAction[];
  /**
   * 底仓策略因「已建仓」被跳过（true 时表示该底仓此前已建仓、本次按去重未触发，
   * 可在 UI 提供「再次建仓」入口手动重新建仓）。
   */
  baseAlreadyBuilt?: boolean;
}

/** 实盘策略执行预览结果 */
export interface LivePreviewResult {
  /** 每条策略的求值诊断（含未触发） */
  diagnostics: LiveStrategyDiagnostic[];
  /** 归并冲突后的最终动作（先卖后买 / 同向合并） */
  merged: StrategyAction[];
}

/**
 * 构建实盘求值上下文（与回测 buildContext 同口径，但面向单时点）。
 *
 * `navTradingDaysAgo(code, n)` 以「今日（date）在该基金升序序列中的下标」为基准回看 n 个交易日；
 * `dayIndex` 取今日下标，使阈值类策略的冷却判定（lastBuyDayIndex / lastSellDayIndex）行为一致。
 */
export function buildLiveDayContext(input: LiveExecInput): DayContext {
  const { date, navData, positions, cash } = input;

  const navOn = (code: FundCode, d: string): number | undefined =>
    navData[code]?.find((p) => p.date === d)?.nav;

  const indexOfToday = (code: FundCode): number => {
    const arr = navData[code];
    if (!arr) return -1;
    return arr.findIndex((p) => p.date === date);
  };

  return {
    date,
    // 今日下标（无该基金历史时退化为 0），仅用于冷却判定
    dayIndex: Math.max(0, indexOfToday(input.strategies[0]?.fundCode ?? '')),
    cash,
    navToday: (code) => navOn(code, date),
    navTradingDaysAgo: (code, n) => {
      const arr = navData[code];
      if (!arr) return undefined;
      const idx = indexOfToday(code);
      if (idx < 0 || idx - n < 0) return undefined;
      return arr[idx - n].nav;
    },
    navHistory: (code) => {
      const arr = navData[code] ?? [];
      return arr.filter((p) => dateLte(p.date, date));
    },
    position: (code): PositionView | undefined => {
      const pos = positions[code];
      if (!pos || pos.shares <= 0) return undefined;
      return {
        fundCode: code,
        shares: pos.shares,
        cost: pos.cost,
        avgCost: pos.cost / pos.shares,
      };
    },
  };
}

/**
 * 预览实盘策略执行：对每条启用策略以「全新运行时状态」求值一次，
 * 收集诊断与归并后的最终动作（不产生任何副作用，纯函数，便于预览与测试）。
 *
 * 说明：手动执行视为「现在按当前估值与持仓求值一次」，因此运行时状态为空——
 * 定投类策略（依赖周期键去重）将立即触发一次定投，符合「手动执行即定投一次」直觉。
 *
 * 例外：底仓（BASE_POSITION）为一次性建仓策略。`executedBaseStrategyIds` 中记录的
 * 底仓策略会被 seed 为「已建仓」，本次不再触发，避免手动多次执行时重复买入。
 */
export function previewLiveExecution(input: LiveExecInput): LivePreviewResult {
  const ctx = buildLiveDayContext(input);
  const diagnostics: LiveStrategyDiagnostic[] = [];
  const rawActions: StrategyAction[] = [];
  const executedBase = new Set(input.executedBaseStrategyIds ?? []);

  for (const s of input.strategies) {
    // 底仓为一次性建仓：已建仓的 seed baseBought=true，使其本次不再触发
    const baseAlreadyBuilt = s.templateType === 'BASE_POSITION' && executedBase.has(s.id);
    const state: StrategyRuntimeState = baseAlreadyBuilt ? { baseBought: true } : {};
    const actions = s.enabled ? evaluateStrategy(s, ctx, state) : [];
    diagnostics.push({
      strategyId: s.id,
      strategyName: s.name,
      templateType: s.templateType,
      fundCode: s.fundCode,
      enabled: s.enabled,
      triggered: actions.length > 0,
      actions,
      baseAlreadyBuilt: baseAlreadyBuilt || undefined,
    });
    rawActions.push(...actions);
  }

  const merged = mergeActions(rawActions, input.conflictPolicy);
  return { diagnostics, merged };
}
