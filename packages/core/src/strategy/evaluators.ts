import type {
  Strategy,
  DcaParams,
  BasePositionParams,
  SmartDcaChangeParams,
  SmartDcaMaParams,
  ValueAveragingParams,
  ThresholdBuyParams,
  SmartThresholdBuyChangeParams,
  ThresholdSellParams,
  SmartThresholdSellChangeParams,
  TakeProfitParams,
  SmartTakeProfitParams,
  StopLossParams,
  GridParams,
} from '../domain';
import { dayOfWeek } from '../utils/date';
import { clamp } from '../utils/decimal';
import type { DayContext, StrategyAction, StrategyRuntimeState } from './types';

/**
 * 单条策略求值：给定当日上下文与运行时状态，返回触发的动作（可能为空）。
 * 同时就地更新运行时状态（如定投周期标记、网格层）。
 */
export function evaluateStrategy(
  strategy: Strategy,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  if (!strategy.enabled) return [];
  switch (strategy.params.type) {
    case 'DCA':
      return evalDca(strategy, strategy.params, ctx, state);
    case 'BASE_POSITION':
      return evalBasePosition(strategy, strategy.params, ctx, state);
    case 'SMART_DCA_CHANGE':
      return evalSmartDcaChange(strategy, strategy.params, ctx, state);
    case 'SMART_DCA_MA':
      return evalSmartDcaMa(strategy, strategy.params, ctx, state);
    case 'VALUE_AVERAGING':
      return evalValueAveraging(strategy, strategy.params, ctx, state);
    case 'THRESHOLD_BUY':
      return evalThresholdBuy(strategy, strategy.params, ctx, state);
    case 'SMART_THRESHOLD_BUY_CHANGE':
      return evalSmartThresholdBuyChange(strategy, strategy.params, ctx, state);
    case 'THRESHOLD_SELL':
      return evalThresholdSell(strategy, strategy.params, ctx, state);
    case 'SMART_THRESHOLD_SELL_CHANGE':
      return evalSmartThresholdSellChange(strategy, strategy.params, ctx, state);
    case 'TAKE_PROFIT':
      return evalTakeProfit(strategy, strategy.params, ctx);
    case 'SMART_TAKE_PROFIT':
      return evalSmartTakeProfit(strategy, strategy.params, ctx, state);
    case 'STOP_LOSS':
      return evalStopLoss(strategy, strategy.params, ctx);
    case 'GRID':
      return evalGrid(strategy, strategy.params, ctx, state);
    default:
      return [];
  }
}

/**
 * 判断当日是否为定投周期的执行日（含目标日逢非交易日的"过期补投"），并返回本期 key。
 * 通过 state.lastContribKey 去重保证每期最多投一次。返回 due=true 时已写入 key。
 */
function periodDue(
  date: string,
  period: 'WEEKLY' | 'MONTHLY',
  dayOfPeriod: number,
  state: StrategyRuntimeState,
): boolean {
  const [y, m, d] = date.split('-').map(Number);
  let due = false;
  let key = '';
  if (period === 'WEEKLY') {
    const dow = dayOfWeek(date); // 0=周日
    const targetDow = dayOfPeriod === 7 ? 0 : dayOfPeriod;
    key = `${y}-W${isoWeek(date)}`;
    due = dow === targetDow;
  } else {
    key = `${y}-${m}`;
    due = d === dayOfPeriod || d > dayOfPeriod; // 当日或已过目标日（补投）
  }
  if (due && state.lastContribKey !== key) {
    state.lastContribKey = key;
    return true;
  }
  return false;
}

/** 智能定投的投入倍数：按偏离度逐档调整。下跌/低于均线 → 多投；上涨/高于均线 → 少投。 */
function smartFactor(
  deviation: number,
  stepPct: number,
  adjustPct: number,
  minFactor: number,
  maxFactor: number,
): number {
  if (stepPct <= 0) return 1;
  const factor = 1 - (deviation / stepPct) * adjustPct;
  return clamp(factor, minFactor, maxFactor);
}

/** 定投：按周期（每周某日 / 每月某日）定额买入 */
function evalDca(
  s: Strategy,
  p: DcaParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  if (!periodDue(ctx.date, p.period, p.dayOfPeriod, state)) return [];
  if (ctx.cash < p.amount) return [];
  return [
    {
      strategyId: s.id,
      fundCode: s.fundCode,
      side: 'BUY',
      amount: p.amount,
      reason: `定投（${p.period === 'WEEKLY' ? '每周' : '每月'}）`,
    },
  ];
}

/** 底仓：首个交易日一次性建仓，之后不再操作 */
function evalBasePosition(
  s: Strategy,
  p: BasePositionParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  if (state.baseBought) return [];
  state.baseBought = true; // 仅在首次求值（即第一个交易日）建仓
  if (p.amount <= 0 || ctx.cash < p.amount) return [];
  return [
    {
      strategyId: s.id,
      fundCode: s.fundCode,
      side: 'BUY',
      amount: p.amount,
      reason: `建立底仓¥${p.amount}`,
    },
  ];
}

/** 智能定投-涨跌幅模式：按周期定投，金额随近 referenceWindow 日涨跌幅调整 */
function evalSmartDcaChange(
  s: Strategy,
  p: SmartDcaChangeParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  if (!periodDue(ctx.date, p.period, p.dayOfPeriod, state)) return [];
  const today = ctx.navToday(s.fundCode);
  const past = ctx.navTradingDaysAgo(s.fundCode, p.referenceWindow);
  // 参考数据不足时退化为基准金额
  const deviation = today !== undefined && past !== undefined && past > 0 ? (today - past) / past : 0;
  const factor = smartFactor(deviation, p.stepPct, p.adjustPct, p.minFactor, p.maxFactor);
  const amount = Math.round(p.baseAmount * factor);
  if (amount <= 0 || ctx.cash < amount) return [];
  return [
    {
      strategyId: s.id,
      fundCode: s.fundCode,
      side: 'BUY',
      amount,
      reason: `智能定投(涨跌幅 ${(deviation * 100).toFixed(1)}%, ×${factor.toFixed(2)})`,
    },
  ];
}

/** 智能定投-均线模式：按周期定投，金额随当前净值相对 maWindow 日均线的偏离调整 */
function evalSmartDcaMa(
  s: Strategy,
  p: SmartDcaMaParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  if (!periodDue(ctx.date, p.period, p.dayOfPeriod, state)) return [];
  const today = ctx.navToday(s.fundCode);
  const history = ctx.navHistory(s.fundCode);
  let deviation = 0;
  if (today !== undefined && history.length >= 1) {
    const window = Math.min(p.maWindow, history.length);
    const recent = history.slice(-window);
    const ma = recent.reduce((acc, pt) => acc + pt.nav, 0) / recent.length;
    if (ma > 0) deviation = (today - ma) / ma;
  }
  const factor = smartFactor(deviation, p.stepPct, p.adjustPct, p.minFactor, p.maxFactor);
  const amount = Math.round(p.baseAmount * factor);
  if (amount <= 0 || ctx.cash < amount) return [];
  return [
    {
      strategyId: s.id,
      fundCode: s.fundCode,
      side: 'BUY',
      amount,
      reason: `智能定投(均线偏离 ${(deviation * 100).toFixed(1)}%, ×${factor.toFixed(2)})`,
    },
  ];
}

/**
 * 目标市值法定投（Value Averaging）：每期使持仓市值贴近"匀速增长"的目标路径。
 * 第 k 期目标市值 = targetStep × k；与当前市值的差额决定买入或卖出。
 */
function evalValueAveraging(
  s: Strategy,
  p: ValueAveragingParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  if (!periodDue(ctx.date, p.period, p.dayOfPeriod, state)) return [];
  const nav = ctx.navToday(s.fundCode);
  if (nav === undefined || nav <= 0) return [];

  // 推进期数，计算本期目标市值
  const k = (state.vaPeriodCount ?? 0) + 1;
  state.vaPeriodCount = k;
  const targetValue = p.targetStep * k;

  const pos = ctx.position(s.fundCode);
  const currentValue = pos ? pos.shares * nav : 0;
  const gap = targetValue - currentValue; // >0 需买入；<0 需卖出

  if (gap > 0) {
    let amount = gap;
    if (p.maxBuy > 0) amount = Math.min(amount, p.maxBuy);
    amount = Math.round(amount);
    if (amount <= 0 || ctx.cash < amount) return [];
    return [
      {
        strategyId: s.id,
        fundCode: s.fundCode,
        side: 'BUY',
        amount,
        reason: `目标市值法(目标¥${Math.round(targetValue)}, 补差¥${amount})`,
      },
    ];
  }

  // 市值超过目标 → 卖出超出部分（按需）
  if (p.allowSell && pos && pos.shares > 0) {
    const sellShares = Math.min(pos.shares, -gap / nav);
    if (sellShares > 0) {
      return [
        {
          strategyId: s.id,
          fundCode: s.fundCode,
          side: 'SELL',
          shares: sellShares,
          reason: `目标市值法(目标¥${Math.round(targetValue)}, 减超出¥${Math.round(-gap)})`,
        },
      ];
    }
  }
  return [];
}

/** 阈值买入：近 window 个交易日跌幅达到 dropPct 时买入 */
function evalThresholdBuy(
  s: Strategy,
  p: ThresholdBuyParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  const today = ctx.navToday(s.fundCode);
  const past = ctx.navTradingDaysAgo(s.fundCode, p.window);
  if (today === undefined || past === undefined || past === 0) return [];

  const drop = (past - today) / past; // 正数表示下跌
  if (drop >= p.dropPct) {
    // 避免连续重复触发：同一窗口内每 window 天最多买一次
    if (state.lastBuyDayIndex !== undefined && ctx.dayIndex - state.lastBuyDayIndex < p.window) {
      return [];
    }
    if (ctx.cash >= p.amount) {
      state.lastBuyDayIndex = ctx.dayIndex;
      return [
        {
          strategyId: s.id,
          fundCode: s.fundCode,
          side: 'BUY',
          amount: p.amount,
          reason: `近${p.window}日跌${(drop * 100).toFixed(2)}%触发买入`,
        },
      ];
    }
  }
  return [];
}

/**
 * 智能阈值买入-涨跌幅模式：近 window 日跌幅达 dropPct 起触发买入，
 * 买入金额随超出阈值的跌幅放大（跌得越多买得越多）。
 */
function evalSmartThresholdBuyChange(
  s: Strategy,
  p: SmartThresholdBuyChangeParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  const today = ctx.navToday(s.fundCode);
  const past = ctx.navTradingDaysAgo(s.fundCode, p.window);
  if (today === undefined || past === undefined || past === 0) return [];

  const drop = (past - today) / past; // 正数表示下跌
  if (drop < p.dropPct) return [];

  // 避免连续重复触发：同一窗口内每 window 天最多买一次
  if (state.lastBuyDayIndex !== undefined && ctx.dayIndex - state.lastBuyDayIndex < p.window) {
    return [];
  }

  // 超额跌幅越大，买入金额倍数越高
  const excess = drop - p.dropPct;
  const factor =
    p.stepPct > 0
      ? clamp(1 + (excess / p.stepPct) * p.adjustPct, p.minFactor, p.maxFactor)
      : clamp(1, p.minFactor, p.maxFactor);
  const amount = Math.round(p.baseAmount * factor);
  if (amount <= 0 || ctx.cash < amount) return [];

  state.lastBuyDayIndex = ctx.dayIndex;
  return [
    {
      strategyId: s.id,
      fundCode: s.fundCode,
      side: 'BUY',
      amount,
      reason: `近${p.window}日跌${(drop * 100).toFixed(2)}%触发智能买入¥${amount}(×${factor.toFixed(2)})`,
    },
  ];
}

/** 阈值卖出：近 window 个交易日涨幅达到 risePct 时卖出 amount 金额 */
function evalThresholdSell(
  s: Strategy,
  p: ThresholdSellParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  const pos = ctx.position(s.fundCode);
  if (!pos || pos.shares <= 0) return [];
  const today = ctx.navToday(s.fundCode);
  const past = ctx.navTradingDaysAgo(s.fundCode, p.window);
  if (today === undefined || past === undefined || past === 0) return [];

  const rise = (today - past) / past; // 正数表示上涨
  if (rise >= p.risePct) {
    // 避免连续重复触发：同一窗口内每 window 天最多卖一次
    if (state.lastSellDayIndex !== undefined && ctx.dayIndex - state.lastSellDayIndex < p.window) {
      return [];
    }
    state.lastSellDayIndex = ctx.dayIndex;
    return [
      {
        strategyId: s.id,
        fundCode: s.fundCode,
        side: 'SELL',
        amount: p.amount,
        reason: `近${p.window}日涨${(rise * 100).toFixed(2)}%触发卖出¥${p.amount}`,
      },
    ];
  }
  return [];
}

/**
 * 智能阈值卖出-涨跌幅模式：近 window 日涨幅达 risePct 起触发卖出，
 * 卖出金额随超出阈值的涨幅放大（涨得越多卖得越多）。
 */
function evalSmartThresholdSellChange(
  s: Strategy,
  p: SmartThresholdSellChangeParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  const pos = ctx.position(s.fundCode);
  if (!pos || pos.shares <= 0) return [];
  const today = ctx.navToday(s.fundCode);
  const past = ctx.navTradingDaysAgo(s.fundCode, p.window);
  if (today === undefined || past === undefined || past === 0) return [];

  const rise = (today - past) / past; // 正数表示上涨
  if (rise < p.risePct) return [];

  // 避免连续重复触发：同一窗口内每 window 天最多卖一次
  if (state.lastSellDayIndex !== undefined && ctx.dayIndex - state.lastSellDayIndex < p.window) {
    return [];
  }

  // 超额涨幅越大，卖出金额倍数越高
  const excess = rise - p.risePct;
  const factor =
    p.stepPct > 0
      ? clamp(1 + (excess / p.stepPct) * p.adjustPct, p.minFactor, p.maxFactor)
      : clamp(1, p.minFactor, p.maxFactor);
  const amount = Math.round(p.baseAmount * factor);
  if (amount <= 0) return [];

  state.lastSellDayIndex = ctx.dayIndex;
  return [
    {
      strategyId: s.id,
      fundCode: s.fundCode,
      side: 'SELL',
      amount,
      reason: `近${p.window}日涨${(rise * 100).toFixed(2)}%触发智能卖出¥${amount}(×${factor.toFixed(2)})`,
    },
  ];
}

/** 止盈：持仓收益率达到 gainPct 卖出 sellRatio */
function evalTakeProfit(s: Strategy, p: TakeProfitParams, ctx: DayContext): StrategyAction[] {
  const pos = ctx.position(s.fundCode);
  const nav = ctx.navToday(s.fundCode);
  if (!pos || pos.shares <= 0 || nav === undefined) return [];
  const profitRate = (nav - pos.avgCost) / pos.avgCost;
  if (profitRate >= p.gainPct) {
    return [
      {
        strategyId: s.id,
        fundCode: s.fundCode,
        side: 'SELL',
        ratio: p.sellRatio,
        reason: `收益率达${(profitRate * 100).toFixed(2)}%止盈`,
      },
    ];
  }
  return [];
}

/**
 * 智能止盈（分档加码卖出）：收益越高卖得越多。
 * 当前所处档位 tier = floor((profitRate − startGainPct) / stepPct) + 1（profitRate>=startGainPct 时 >=1）。
 * 相对上次已触发的最高档每上一档，按 stepSellRatio 累加卖出比例（上限 maxSellRatio），
 * 基于当前剩余份额卖出；同档不重复触发（收益回落不卖）。
 */
function evalSmartTakeProfit(
  s: Strategy,
  p: SmartTakeProfitParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  const pos = ctx.position(s.fundCode);
  const nav = ctx.navToday(s.fundCode);
  if (!pos || pos.shares <= 0 || nav === undefined) return [];
  const profitRate = (nav - pos.avgCost) / pos.avgCost;
  if (profitRate < p.startGainPct || p.stepPct <= 0) return [];

  const tier = Math.floor((profitRate - p.startGainPct) / p.stepPct) + 1;
  const lastTier = state.lastProfitTier ?? 0;
  if (tier <= lastTier) return []; // 未上新档，不重复卖

  const tiersUp = tier - lastTier;
  state.lastProfitTier = tier;
  const ratio = Math.min(p.maxSellRatio, p.stepSellRatio * tiersUp);
  if (ratio <= 0) return [];
  return [
    {
      strategyId: s.id,
      fundCode: s.fundCode,
      side: 'SELL',
      ratio,
      reason: `智能止盈(收益${(profitRate * 100).toFixed(1)}% 第${tier}档, 卖${(ratio * 100).toFixed(0)}%)`,
    },
  ];
}

/** 止损：持仓收益率跌破 -lossPct 卖出 sellRatio */
function evalStopLoss(s: Strategy, p: StopLossParams, ctx: DayContext): StrategyAction[] {
  const pos = ctx.position(s.fundCode);
  const nav = ctx.navToday(s.fundCode);
  if (!pos || pos.shares <= 0 || nav === undefined) return [];
  const profitRate = (nav - pos.avgCost) / pos.avgCost;
  if (profitRate <= -p.lossPct) {
    return [
      {
        strategyId: s.id,
        fundCode: s.fundCode,
        side: 'SELL',
        ratio: p.sellRatio,
        reason: `收益率达${(profitRate * 100).toFixed(2)}%止损`,
      },
    ];
  }
  return [];
}

/** 网格：区间 [lower, upper] 等分 grids 层，净值下穿买入、上穿卖出 */
function evalGrid(
  s: Strategy,
  p: GridParams,
  ctx: DayContext,
  state: StrategyRuntimeState,
): StrategyAction[] {
  const nav = ctx.navToday(s.fundCode);
  if (nav === undefined) return [];
  const level = navToGridLevel(nav, p);

  if (!state.initialized) {
    state.initialized = true;
    state.lastGridLevel = level;
    return [];
  }

  const prevLevel = state.lastGridLevel ?? level;
  if (level === prevLevel) return [];

  const actions: StrategyAction[] = [];
  if (level < prevLevel) {
    // 下跌穿越，逐格买入（每跨一格买 perGridAmount）
    const grids = prevLevel - level;
    const amount = p.perGridAmount * grids;
    if (ctx.cash >= amount) {
      actions.push({
        strategyId: s.id,
        fundCode: s.fundCode,
        side: 'BUY',
        amount,
        reason: `网格下穿 ${grids} 格买入`,
      });
    }
  } else {
    // 上涨穿越，卖出。按每格对应金额折算份额由引擎处理（这里用比例近似：卖出对应格数的份额）
    const pos = ctx.position(s.fundCode);
    if (pos && pos.shares > 0) {
      const grids = level - prevLevel;
      const sharesToSell = Math.min(pos.shares, (p.perGridAmount * grids) / nav);
      if (sharesToSell > 0) {
        actions.push({
          strategyId: s.id,
          fundCode: s.fundCode,
          side: 'SELL',
          shares: sharesToSell,
          reason: `网格上穿 ${grids} 格卖出`,
        });
      }
    }
  }
  state.lastGridLevel = level;
  return actions;
}

/** 净值映射到网格层（0 = lower 以下，grids = upper 以上） */
export function navToGridLevel(nav: number, p: GridParams): number {
  if (p.grids <= 0 || p.upper <= p.lower) return 0;
  if (nav <= p.lower) return 0;
  if (nav >= p.upper) return p.grids;
  const step = (p.upper - p.lower) / p.grids;
  return Math.floor((nav - p.lower) / step);
}

/** ISO 周序（粗略，用于定投周键去重） */
function isoWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((dt.getTime() - firstThursday.getTime()) / (7 * 86400000));
}
