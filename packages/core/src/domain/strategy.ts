import type { FundCode } from './fund';

/** 策略模板类型 */
export type StrategyTemplate =
  | 'DCA' // 定投
  | 'BASE_POSITION' // 底仓（首日一次性建仓）
  | 'SMART_DCA_CHANGE' // 智能定投-涨跌幅模式
  | 'SMART_DCA_MA' // 智能定投-均线模式
  | 'VALUE_AVERAGING' // 目标市值法定投
  | 'THRESHOLD_BUY' // 阈值买入（跌幅触发）
  | 'SMART_THRESHOLD_BUY_CHANGE' // 智能阈值买入-涨跌幅模式
  | 'THRESHOLD_SELL' // 阈值卖出（涨幅触发）
  | 'SMART_THRESHOLD_SELL_CHANGE' // 智能阈值卖出-涨跌幅模式
  | 'TAKE_PROFIT' // 止盈
  | 'SMART_TAKE_PROFIT' // 智能止盈（分档加码卖出）
  | 'STOP_LOSS' // 止损
  | 'GRID'; // 网格

/**
 * 定投周期：每日 / 每周 / 每月。
 * - DAILY：每个交易日定投一次（dayOfPeriod 无意义，可忽略）；
 * - WEEKLY：每周某日（dayOfPeriod=1~7，周一~周日）；
 * - MONTHLY：每月某日（dayOfPeriod=1~28）。
 */
export type DcaPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';

/** 定投参数 */
export interface DcaParams {
  type: 'DCA';
  /** 周期 */
  period: DcaPeriod;
  /** 周期内执行日：DAILY 忽略，WEEKLY=1~7(周一~周日)，MONTHLY=1~28 */
  dayOfPeriod: number;
  /** 每次定投金额 */
  amount: number;
}

/**
 * 底仓：在回测/模拟的第一个交易日一次性买入建立基础仓位，之后不再操作。
 * 常与定投/网格等组合，先建底仓再逐步加仓。
 */
export interface BasePositionParams {
  type: 'BASE_POSITION';
  /** 建仓金额（元） */
  amount: number;
}

/**
 * 目标市值法定投（Value Averaging）：设定持仓市值按固定额度匀速增长的目标路径，
 * 第 k 次定投后目标市值 = targetStep × k。每期买入/卖出恰好使当前持仓市值贴近目标：
 * - 市值低于目标（下跌）→ 买入差额，自动越跌越买；
 * - 市值高于目标（上涨）→ 卖出超出部分（可关闭卖出，仅买入）。
 * 单期买入额受 maxBuy 限制，避免极端行情下大额买入。
 */
export interface ValueAveragingParams {
  type: 'VALUE_AVERAGING';
  period: DcaPeriod;
  dayOfPeriod: number;
  /** 每期目标市值增长额度 */
  targetStep: number;
  /** 市值超过目标时是否卖出（false=只买不卖） */
  allowSell: boolean;
  /** 单期最大买入额（0=不限制） */
  maxBuy: number;
}

/**
 * 智能定投-涨跌幅模式：按周期定投，但投入金额随"近 referenceWindow 个交易日涨跌幅"调整。
 * 偏离度 deviation = (今净值 − N日前净值) / N日前净值；
 * 投入倍数 factor = clamp(1 − (deviation / stepPct) × adjustPct, minFactor, maxFactor)；
 * 即下跌越多投越多、上涨越多投越少。amount = baseAmount × factor（factor≈0 时跳过）。
 */
export interface SmartDcaChangeParams {
  type: 'SMART_DCA_CHANGE';
  period: DcaPeriod;
  dayOfPeriod: number;
  /** 基准定投金额 */
  baseAmount: number;
  /** 涨跌幅参考窗口（交易日） */
  referenceWindow: number;
  /** 每档涨跌幅（如 0.1 = 10%） */
  stepPct: number;
  /** 每档调整比例（如 0.1 = 10%） */
  adjustPct: number;
  /** 投入倍数下限（如 0） */
  minFactor: number;
  /** 投入倍数上限（如 2） */
  maxFactor: number;
}

/**
 * 智能定投-均线模式：按周期定投，投入金额随"当前净值相对 maWindow 日均线的偏离"调整。
 * 偏离度 deviation = (今净值 − MA) / MA；factor 同涨跌幅模式；
 * 即低于均线（便宜）投更多、高于均线（贵）投更少。
 */
export interface SmartDcaMaParams {
  type: 'SMART_DCA_MA';
  period: DcaPeriod;
  dayOfPeriod: number;
  baseAmount: number;
  /** 均线窗口（交易日，如 250≈年线） */
  maWindow: number;
  stepPct: number;
  adjustPct: number;
  minFactor: number;
  maxFactor: number;
}

/** 阈值买入：近 window 个交易日跌幅达到 dropPct 时买入 amount */
export interface ThresholdBuyParams {
  type: 'THRESHOLD_BUY';
  /** 跌幅阈值（正数，如 0.05 表示跌 5%） */
  dropPct: number;
  /** 观察窗口（交易日） */
  window: number;
  amount: number;
}

/**
 * 智能阈值买入-涨跌幅模式：与"智能阈值卖出-涨跌幅模式"对称的买入端策略。
 * 当近 window 个交易日跌幅达到 dropPct 起触发买入，但买入金额随跌幅大小动态放大：
 * 超出阈值的跌幅越多买得越多（越跌越买、抄底加码）。
 * 超额跌幅 excess = drop − dropPct；
 * 买入倍数 factor = clamp(1 + (excess / stepPct) × adjustPct, minFactor, maxFactor)；
 * 买入金额 = baseAmount × factor（现金不足则跳过本次）。
 * 与阈值买入一致带 window 冷却，避免连续重复触发。
 */
export interface SmartThresholdBuyChangeParams {
  type: 'SMART_THRESHOLD_BUY_CHANGE';
  /** 跌幅触发阈值（正数，如 0.05 表示跌 5% 起买） */
  dropPct: number;
  /** 观察窗口（交易日） */
  window: number;
  /** 基准买入金额（达到阈值时买入，元） */
  baseAmount: number;
  /** 每档跌幅（如 0.05 = 每多跌 5% 一档） */
  stepPct: number;
  /** 每档加码比例（如 0.5 = 每档买入金额 +50%） */
  adjustPct: number;
  /** 买入倍数下限（如 1） */
  minFactor: number;
  /** 买入倍数上限（如 3） */
  maxFactor: number;
}

/**
 * 阈值/智能阈值卖出的卖出方式：
 * - AMOUNT：按金额卖出（默认，兼容旧导入数据；引擎按成交净值换算份额）；
 * - SHARES：按份额卖出（绝对份额）；
 * - RATIO：按仓位卖出（相对当前持有份额的比例 0~1）。
 */
export type ThresholdSellMode = 'AMOUNT' | 'SHARES' | 'RATIO';

/**
 * 阈值卖出：近 window 个交易日涨幅达到 risePct 时按 sellMode 指定方式卖出（持仓不足则全卖）。
 * 卖出方式默认金额（AMOUNT），兼容旧导入数据（旧数据无 sellMode 字段即按金额）。
 */
export interface ThresholdSellParams {
  type: 'THRESHOLD_SELL';
  /** 涨幅阈值（正数，如 0.05 表示涨 5%） */
  risePct: number;
  /** 观察窗口（交易日） */
  window: number;
  /** 卖出金额（元，sellMode=AMOUNT 时生效；保留以兼容旧数据） */
  amount: number;
  /** 卖出方式（默认 AMOUNT，缺省视为按金额，兼容旧数据） */
  sellMode?: ThresholdSellMode;
  /** 卖出份额（sellMode=SHARES 时生效） */
  sellShares?: number;
  /** 卖出仓位比例 0~1（sellMode=RATIO 时生效） */
  sellRatio?: number;
}

/**
 * 智能阈值卖出-涨跌幅模式：与"智能定投-涨跌幅模式"对称的卖出端策略。
 * 当近 window 个交易日涨幅达到 risePct 起触发卖出，但卖出量随涨幅大小动态放大：
 * 超出阈值的涨幅越多卖得越多。
 * 超额涨幅 excess = rise − risePct；
 * 卖出倍数 factor = clamp(1 + (excess / stepPct) × adjustPct, minFactor, maxFactor)；
 * 卖出量 = 基准量 × factor（基准量按 sellMode 取金额/份额/仓位比例；持仓不足则全卖）。
 * 与阈值卖出一致带 window 冷却，避免连续重复触发。卖出方式默认金额（兼容旧数据）。
 */
export interface SmartThresholdSellChangeParams {
  type: 'SMART_THRESHOLD_SELL_CHANGE';
  /** 涨幅触发阈值（正数，如 0.05 表示涨 5% 起卖） */
  risePct: number;
  /** 观察窗口（交易日） */
  window: number;
  /** 基准卖出金额（达到阈值时卖出，元，sellMode=AMOUNT 时生效；保留以兼容旧数据） */
  baseAmount: number;
  /** 每档涨幅（如 0.05 = 每多涨 5% 一档） */
  stepPct: number;
  /** 每档加码比例（如 0.5 = 每档卖出量 +50%） */
  adjustPct: number;
  /** 卖出倍数下限（如 1） */
  minFactor: number;
  /** 卖出倍数上限（如 3） */
  maxFactor: number;
  /** 卖出方式（默认 AMOUNT，缺省视为按金额，兼容旧数据） */
  sellMode?: ThresholdSellMode;
  /** 基准卖出份额（sellMode=SHARES 时生效） */
  baseShares?: number;
  /** 基准卖出仓位比例 0~1（sellMode=RATIO 时生效） */
  baseRatio?: number;
}

/** 止盈：持仓收益率达到 gainPct 时卖出 sellRatio 比例 */
export interface TakeProfitParams {
  type: 'TAKE_PROFIT';
  gainPct: number;
  /** 卖出比例 0~1 */
  sellRatio: number;
}

/**
 * 智能止盈（分档加码卖出）：收益越高卖得越多，逐步降低仓位锁定利润。
 * 当持仓收益率达到 startGainPct 起开始卖出；之后每上涨 stepPct 一档，
 * 卖出比例增加 stepSellRatio（基于当前剩余份额）；卖出比例上限 maxSellRatio。
 * 同一档位只触发一次（用已触发的最高档去重）。
 */
export interface SmartTakeProfitParams {
  type: 'SMART_TAKE_PROFIT';
  /** 起始止盈收益率（如 0.1 = +10% 开始卖） */
  startGainPct: number;
  /** 每档收益率间隔（如 0.1 = 每多涨 10% 一档） */
  stepPct: number;
  /** 每档卖出比例（基于当前剩余份额，如 0.2 = 卖 20%） */
  stepSellRatio: number;
  /** 单次卖出比例上限（如 0.5） */
  maxSellRatio: number;
}

/** 止损：持仓收益率跌破 -lossPct 时卖出 sellRatio 比例 */
export interface StopLossParams {
  type: 'STOP_LOSS';
  lossPct: number;
  sellRatio: number;
}

/** 网格：区间 [lower, upper] 分 grids 格，触格买卖 perGridAmount */
export interface GridParams {
  type: 'GRID';
  lower: number;
  upper: number;
  grids: number;
  perGridAmount: number;
}

export type StrategyParams =
  | DcaParams
  | BasePositionParams
  | SmartDcaChangeParams
  | SmartDcaMaParams
  | ValueAveragingParams
  | ThresholdBuyParams
  | SmartThresholdBuyChangeParams
  | ThresholdSellParams
  | SmartThresholdSellChangeParams
  | TakeProfitParams
  | SmartTakeProfitParams
  | StopLossParams
  | GridParams;

/** 单条策略 */
export interface Strategy {
  id: string;
  name: string;
  templateType: StrategyTemplate;
  fundCode: FundCode;
  params: StrategyParams;
  enabled: boolean;
}

/** 策略冲突归并策略 */
export interface ConflictPolicy {
  /** 同标的既买又卖时：先卖后买 */
  sellBeforeBuy: boolean;
  /** 同标的同方向多笔合并 */
  mergeSameDirection: boolean;
}

export const DEFAULT_CONFLICT_POLICY: ConflictPolicy = {
  sellBeforeBuy: true,
  mergeSameDirection: true,
};

/** 策略集 */
export interface StrategySet {
  id: string;
  name: string;
  schemaVersion: number;
  createdAt: string;
  strategies: Strategy[];
  conflictPolicy: ConflictPolicy;
}
