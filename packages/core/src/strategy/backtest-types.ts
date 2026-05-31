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
  /** 初始资金 */
  initialCash: number;
  /** 申购费率（统一，默认 0.015） */
  purchaseFeeRate?: number;
  /** 赎回费率（回测简化为统一费率，默认 0） */
  redeemFeeRate?: number;
  /** 无风险年化利率（用于夏普/索提诺，默认 0） */
  riskFreeRate?: number;
  /** 基准基金代码（默认取第一个标的，做买入持有对比） */
  benchmarkFundCode?: FundCode;
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
  /** 期末可用现金 */
  finalCash: number;
  /** 期末持有资产（仅基金持仓市值） */
  finalHoldingValue: number;
  /** 期末持仓成本 */
  finalHoldingCost: number;
  /** 期末总资产 = 现金 + 持仓市值 */
  finalAssets: number;

  // —— 收益 ——
  /** 期末持仓浮动盈亏 = 持仓市值 − 持仓成本 */
  holdingProfit: number;
  /** 期末总收益 = 期末总资产 − 期初可用资金 */
  totalProfit: number;
  /** 总收益率 = 总收益 / 期初可用资金 */
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
  fundCode: FundCode;
  /** 买入持有总收益率 */
  totalReturn: number;
  /** 买入持有年化收益率 */
  annualizedReturn: number;
  /** 买入持有最大回撤 */
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
