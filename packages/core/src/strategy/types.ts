import type { FundCode, NavPoint } from '../domain';

/** 策略产生的交易动作 */
export interface StrategyAction {
  strategyId: string;
  fundCode: FundCode;
  side: 'BUY' | 'SELL';
  /** 买入金额（BUY）；卖出金额（SELL，引擎按净值换算份额，不足则全卖） */
  amount?: number;
  /** 卖出份额（SELL，绝对份额）。与 ratio/amount 互斥 */
  shares?: number;
  /** 卖出比例 0~1（SELL，相对持有份额）。引擎换算为份额 */
  ratio?: number;
  reason: string;
}

/** 回测中某基金的轻量持仓视图（供策略读取） */
export interface PositionView {
  fundCode: FundCode;
  shares: number;
  cost: number;
  /** 平均成本 = cost / shares */
  avgCost: number;
}

/** 策略求值上下文（单个交易日） */
export interface DayContext {
  date: string;
  /** 当前交易日序号（0 基，区间内） */
  dayIndex: number;
  /** 今日单位净值 */
  navToday: (fundCode: FundCode) => number | undefined;
  /** n 个交易日前的净值（n>=1），不足返回 undefined */
  navTradingDaysAgo: (fundCode: FundCode, n: number) => number | undefined;
  /** 截至今日（含）的历史净值，升序 */
  navHistory: (fundCode: FundCode) => NavPoint[];
  /** 当前持仓视图 */
  position: (fundCode: FundCode) => PositionView | undefined;
  /** 可用现金 */
  cash: number;
}

/** 策略运行时可变状态（按 strategyId 维护） */
export interface StrategyRuntimeState {
  initialized?: boolean;
  /** DCA：上次定投周期键 */
  lastContribKey?: string;
  /** VALUE_AVERAGING：已执行的定投期数 */
  vaPeriodCount?: number;
  /** SMART_TAKE_PROFIT：已触发的最高止盈档位（从 0 起） */
  lastProfitTier?: number;
  /** THRESHOLD_BUY：上次买入日 */
  lastBuyDayIndex?: number;
  /** THRESHOLD_SELL：上次卖出日 */
  lastSellDayIndex?: number;
  /** GRID：上次所处网格层 */
  lastGridLevel?: number;
}
