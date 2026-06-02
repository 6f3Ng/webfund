import {
  previewLiveExecution,
  type LivePreviewResult,
  type NavPoint,
  type Portfolio,
  type Strategy,
  type StrategyAction,
  type ConflictPolicy,
} from '@fund/core';
import { fetchHistory } from '@/api/funds';
import { mapRequests } from '@/services/requestMode';
import type { DisplayQuote } from '@/stores/valuationStore';

/** 今日字符串 'YYYY-MM-DD' */
function todayStr(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * 为实盘策略执行加载各标的的历史净值，并把「今日」一点用持仓页展示的估值净值补齐到序列末尾，
 * 以保证涨跌幅/均线/阈值类策略的取值口径与持仓页一致（需求 2：不同时间点使用估值的值与持仓页相同）。
 *
 * @param codes  涉及的标的基金代码
 * @param quotes 持仓页当前展示行情（fundCode -> DisplayQuote），提供今日估值净值
 */
export async function loadLiveNavData(
  codes: string[],
  quotes: Record<string, DisplayQuote>,
): Promise<Record<string, NavPoint[]>> {
  const today = todayStr();
  const start = todayStr(new Date(Date.now() - 400 * 86400000)); // 近 ~400 天，覆盖年线窗口

  const entries = await mapRequests(codes, async (code) => {
      let points: NavPoint[] = [];
      try {
        const res = await fetchHistory(code, start, today);
        points = res.points.map((p) => ({ date: p.date, nav: p.nav, growthRate: p.growthPct }));
      } catch {
        points = [];
      }
      // 用持仓页展示估值补齐今日点（与持仓页同源）
      const q = quotes[code];
      if (q && q.nav > 0) {
        const idx = points.findIndex((p) => p.date === today);
        if (idx >= 0) points[idx] = { ...points[idx], nav: q.nav };
        else points.push({ date: today, nav: q.nav });
      }
      points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return [code, points] as const;
    });
  return Object.fromEntries(entries);
}

/** 收集组合配置的策略集中涉及的标的基金代码（仅启用策略） */
export function collectStrategyCodes(strategies: Strategy[]): string[] {
  return [...new Set(strategies.filter((s) => s.enabled).map((s) => s.fundCode))];
}

/**
 * 预览组合按其配置策略集手动执行的结果（不落地）。
 *
 * @param portfolio   目标持仓集合（提供持仓与可用现金）
 * @param strategies  组合配置的全部策略（来自其引用的策略集，已合并）
 * @param policy      冲突归并策略
 * @param quotes      持仓页展示行情（提供今日估值净值）
 */
export async function previewPortfolioExecution(
  portfolio: Portfolio,
  strategies: Strategy[],
  policy: ConflictPolicy,
  quotes: Record<string, DisplayQuote>,
): Promise<LivePreviewResult> {
  const enabled = strategies.filter((s) => s.enabled);
  const codes = collectStrategyCodes(enabled);
  const navData = await loadLiveNavData(codes, quotes);

  const positions: Record<string, { shares: number; cost: number }> = {};
  for (const p of portfolio.positions) {
    positions[p.fundCode] = { shares: p.shares, cost: p.cost };
  }

  return previewLiveExecution({
    date: todayStr(),
    strategies: enabled,
    navData,
    positions,
    cash: portfolio.cash,
    conflictPolicy: policy,
    // 已建底仓的策略本次不再触发，避免底仓重复买入
    executedBaseStrategyIds: portfolio.settings.executedBaseStrategyIds ?? [],
  });
}

/** 预览动作转换为可读摘要（用于展示） */
export function describeAction(action: StrategyAction, nav?: number): string {
  if (action.side === 'BUY') {
    return `买入 ¥${(action.amount ?? 0).toFixed(2)}`;
  }
  if (action.ratio !== undefined) {
    return `卖出 ${(action.ratio * 100).toFixed(0)}% 份额`;
  }
  if (action.amount !== undefined) {
    const shares = nav && nav > 0 ? ` (≈${(action.amount / nav).toFixed(2)} 份)` : '';
    return `卖出 ¥${action.amount.toFixed(2)}${shares}`;
  }
  return `卖出 ${(action.shares ?? 0).toFixed(2)} 份`;
}
