import type { FundCode } from './fund';

/** 交易类型 */
export type TransactionType = 'BUY' | 'SELL' | 'CONVERT' | 'DIVIDEND';

/** 订单状态 */
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

/** 份额批次（用于 FIFO 计算持有天数与赎回费分档） */
export interface ShareLot {
  /** 份额获得日（确认日） YYYY-MM-DD */
  acquiredDate: string;
  /** 该批次份额 */
  shares: number;
  /** 获得时净值 */
  nav: number;
}

/** 待确认订单 */
export interface Order {
  id: string;
  type: TransactionType;
  fundCode: FundCode;
  /** 转换目标基金 */
  targetFundCode?: FundCode;
  /** 申报时间（ISO 字符串，含时分） */
  submitAt: string;
  /** 计算出的确认日 YYYY-MM-DD */
  confirmDate: string;
  /** 买入金额（BUY/CONVERT 源金额可空） */
  amount?: number;
  /** 卖出/转换份额 */
  shares?: number;
  status: OrderStatus;
  note?: string;
}

/** 已确认交易流水 */
export interface Transaction {
  id: string;
  type: TransactionType;
  fundCode: FundCode;
  targetFundCode?: FundCode;
  /** 确认日 YYYY-MM-DD */
  date: string;
  /** 成交净值 */
  nav: number;
  /** 成交金额（净额，含费用前的口径见 note） */
  amount: number;
  /** 成交份额 */
  shares: number;
  /** 费用 */
  fee: number;
  note?: string;
}

/** 单只基金持仓 */
export interface Position {
  fundCode: FundCode;
  /** 已确认持有份额 */
  shares: number;
  /** 可卖份额（份额到账后才可卖，默认确认即可卖，T+1 由日历控制） */
  availableShares: number;
  /** 持仓成本（净投入：累计买入净额 - 累计卖出回收，用于成本与收益计算） */
  cost: number;
  /** 份额批次，FIFO */
  lots: ShareLot[];
}

export interface PortfolioSettings {
  /** 默认估值数据源 */
  defaultValuationSource?: string;
}

/** 在途资金（卖出/转换后 T+N 到账的现金） */
export interface PendingCash {
  id: string;
  /** 资金可用日 YYYY-MM-DD */
  availableDate: string;
  amount: number;
  /** 关联订单 id */
  sourceOrderId: string;
}

/** 在途份额（买入/转入后 T+1 才可卖的份额） */
export interface PendingShares {
  id: string;
  fundCode: FundCode;
  /** 份额可卖日 YYYY-MM-DD */
  availableDate: string;
  shares: number;
  sourceOrderId: string;
}

/** 持仓集合（模拟账户） */
export interface Portfolio {
  id: string;
  name: string;
  schemaVersion: number;
  createdAt: string;
  /** 初始资金 */
  initialCash: number;
  /** 可用现金 */
  cash: number;
  /** 持仓明细 */
  positions: Position[];
  /** 已确认流水 */
  transactions: Transaction[];
  /** 待确认订单 */
  pendingOrders: Order[];
  /** 在途资金（卖出回款 T+N 到账） */
  pendingCash: PendingCash[];
  /** 在途份额（买入/转入 T+1 可卖） */
  pendingShares: PendingShares[];
  settings: PortfolioSettings;
}
