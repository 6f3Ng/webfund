import type { FundCode, NavPoint } from '../domain';

/** 回测输入 */
export interface BacktestInput {
  /** 策略集中的策略列表（已展开） */
  strategies: import('../domain').Strategy[];
  conflictPolicy: import('../domain').ConflictPolicy;
  /** 标的基金历史净值，fundCode -> 升序净值序列 */
  navData: Record<FundCode, NavPoint[]>;
  /** 回测区间 */
  start: string;
  end: string;
  /**
   * 初始资金：作为模拟起点的可用现金。可选。
   * - 提供时：以该值为期初可用现金（买入仍不设上限，现金可为负，代表追加投入）。
   * - 不提供时：自动按策略实际所需资金推导——取模拟过程中现金缺口的最大值，
   *   使期末/期间现金恰好不为负，反映"策略到底需要投入多少钱"。
   */
  initialCash?: number;
  /** 申购费率（统一，默认 0.015） */
  purchaseFeeRate?: number;
  /** 赎回费率（回测简化为统一费率，默认 0） */
  redeemFeeRate?: number;
  /** 无风险年化利率（用于夏普/索提诺，默认 0） */
  riskFreeRate?: number;
  /**
   * 基准基金代码（买入持有对比）。
   * 优先级：benchmarkStrategies（按策略对比）> benchmarkFundCode（指定基金买入持有）> 默认首个标的。
   */
  benchmarkFundCode?: FundCode;
  /**
   * 基准策略（可选）：选择一条/一组策略作为基准对比，按与主回测相同的区间/资金/费率独立回测。
   * 提供时优先于 benchmarkFundCode。
   */
  benchmarkStrategies?: import('../domain').Strategy[];
  /** 基准策略的冲突归并策略（默认与主回测一致或默认策略） */
  benchmarkConflictPolicy?: import('../domain').ConflictPolicy;
  /** 基准展示名称（用于 UI 标注，如策略集名称或基金名称） */
  benchmarkLabel?: string;
}

/** 单日资产快照 */
export interface DailySnapshot {
  date: string;
  /** 总资产 = 现金 + 持仓市值 */
  totalAssets: number;
  cash: number;
  /** 持仓市值（仅基金持有部分） */
  marketValue: number;
  /** 持仓成本（已投入未回收部分） */
  cost: number;
  /** 累计净投入资金 = 累计买入 − 累计卖出回收（反映"真金白银投入了多少"） */
  investedCapital: number;
  /** 持有收益指数（时间加权，剥离现金稀释与资金流入，起点 1.0） */
  holdingIndex: number;
}

/** 回测成交记录 */
export interface BacktestTrade {
  date: string;
  fundCode: FundCode;
  side: 'BUY' | 'SELL';
  nav: number;
  amount: number;
  shares: number;
  fee: number;
  reason: string;
  /** 成交后该基金的持有总份额（已确认份额） */
  holdingShares: number;
  /** 成交后该基金的持有总金额（持有总份额 × 当日成交净值） */
  holdingValue: number;
}

/** 回测结果指标（尽量详尽） */
export interface BacktestMetrics {
  // —— 资金 ——
  /** 期初可用资金 */
  initialCash: number;
  /** 累计买入金额（含费） */
  totalBought: number;
  /** 累计卖出回收金额（扣费后净额） */
  totalSold: number;
  /** 累计交易费用（申购费 + 赎回费） */
  totalFee: number;
  /** 累计净投入 = 累计买入 − 累计卖出回收 */
  netInvested: number;

  // —— 期末状态 ——
  /** 期末可用现金（去掉初始资金限制后可能为负，代表累计追加投入超过期初资金） */
  finalCash: number;
  /** 期末持有资产（仅基金持仓市值） */
  finalHoldingValue: number;
  /** 期末持有份额（所有持仓份额之和） */
  finalHoldingShares: number;
  /** 期末持仓成本（已投入未回收部分） */
  finalHoldingCost: number;
  /** 期末成本单价 = 期末持仓成本 / 期末持有份额（无持仓为 0） */
  finalCostPrice: number;
  /** 期末实际单价 = 期末持有资产 / 期末持有份额（持仓加权市价，无持仓为 0） */
  finalUnitNav: number;
  /** 期末总资产 = 现金 + 持仓市值 */
  finalAssets: number;

  // —— 收益 ——
  /** 期末持仓浮动盈亏 = 持仓市值 − 持仓成本 */
  holdingProfit: number;
  /** 期末持有收益率 = 持仓浮盈 / 持仓成本（金额口径，反映持仓本身的盈亏比例） */
  holdingProfitRate: number;
  /** 期末总收益 = 期末总资产 − 期初可用资金 = 期末持有资产 − 累计净投入 */
  totalProfit: number;
  /**
   * 累计收益率 = 总收益 / 实际投入成本（累计净投入）。
   * 去掉初始资金限制后，以「真金白银投入」为基准衡量收益，不受闲置现金影响。
   */
  cumulativeReturn: number;
  /** 总收益率 = 总收益 / 期初可用资金（保留旧口径，受闲置现金影响） */
  totalReturn: number;
  /** 年化收益率（基于总资产口径） */
  annualizedReturn: number;
  /** 持有收益率（时间加权，反映持仓本身表现，剔除现金/资金流入影响） */
  holdingReturn: number;
  /** 持有年化收益率（基于时间加权持有指数） */
  holdingAnnualizedReturn: number;

  // —— 风险 ——
  /** 总资产最大回撤（正数，如 0.23 = 23%） */
  maxDrawdown: number;
  /** 持有最大回撤（基于时间加权持有指数，反映持仓真实回撤；正数） */
  holdingMaxDrawdown: number;
  /** 持有最大回撤峰值日期 */
  maxDrawdownPeakDate?: string;
  /** 持有最大回撤谷底日期 */
  maxDrawdownTroughDate?: string;
  /** 持有最大回撤修复日期（谷底后回到峰值；未修复为 undefined） */
  maxDrawdownRecoveryDate?: string;
  /** 持有最大回撤修复天数（谷底→修复的交易日数；未修复为 undefined） */
  maxDrawdownRecoveryDays?: number;
  /** 期末仍未修复时，谷底至期末的交易日数 */
  maxDrawdownDaysSinceTrough?: number;
  /** 历史已修复的最大回撤幅度（正数；当前最大回撤未修复时用于补充展示），无则为 0 */
  recoveredMaxDrawdown?: number;
  /** 历史已修复最大回撤的谷底日期 */
  recoveredMaxDrawdownTroughDate?: string;
  /** 历史已修复最大回撤的修复日期 */
  recoveredMaxDrawdownRecoveryDate?: string;
  /** 历史已修复最大回撤的修复天数 */
  recoveredMaxDrawdownRecoveryDays?: number;
  /** 年化波动率（基于持有指数日收益） */
  annualizedVolatility: number;
  /** 夏普比率（基于持有年化收益与波动率） */
  sharpeRatio: number;
  /** 索提诺比率（下行波动） */
  sortinoRatio: number;
  /** 卡玛比率（持有年化收益 / 持有最大回撤） */
  calmarRatio: number;
  /** 盈利日占比（持有指数日收益 > 0 的天数占比） */
  winningDaysRatio: number;

  // —— 交易 ——
  /** 交易次数 */
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  /** 回测交易日数 */
  tradingDays: number;
}

/** 基准对比结果 */
export interface BenchmarkResult {
  /** 基准类型：买入持有某基金 / 按策略回测 */
  kind: 'BUY_HOLD' | 'STRATEGY';
  /** 基准标的基金代码（买入持有时为该基金；策略基准时为代表性标的，可能为空） */
  fundCode?: FundCode;
  /** 基准展示名称（基金名称或策略集名称） */
  label?: string;
  /** 基准总收益率 */
  totalReturn: number;
  /** 基准年化收益率 */
  annualizedReturn: number;
  /** 基准最大回撤 */
  maxDrawdown: number;
  /** 净值曲线（归一化到初始资金） */
  curve: DailySnapshot[];
}

/** 完整回测输出 */
export interface BacktestResult {
  metrics: BacktestMetrics;
  /** 策略组合每日净值曲线 */
  curve: DailySnapshot[];
  trades: BacktestTrade[];
  benchmark?: BenchmarkResult;
}
