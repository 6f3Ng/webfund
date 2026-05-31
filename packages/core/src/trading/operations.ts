import type { Order, Portfolio, TransactionType } from '../domain';
import { generateId } from '../utils/id';
import { roundAmount, roundShares } from '../utils/decimal';
import { calcConfirmDate } from './confirm-date';
import type { TradingCalendar } from './calendar';
import { getOrCreatePosition } from './portfolio-factory';

export interface BuyParams {
  fundCode: string;
  amount: number;
  submitAt: string;
  note?: string;
}

export interface SellParams {
  fundCode: string;
  shares: number;
  submitAt: string;
  note?: string;
}

export interface ConvertParams {
  fromFundCode: string;
  toFundCode: string;
  shares: number;
  submitAt: string;
  note?: string;
}

function makeOrder(
  type: TransactionType,
  base: Partial<Order>,
  submitAt: string,
  calendar: TradingCalendar,
): Order {
  return {
    id: generateId('ord'),
    type,
    fundCode: base.fundCode!,
    targetFundCode: base.targetFundCode,
    submitAt,
    confirmDate: calcConfirmDate(submitAt, calendar),
    amount: base.amount,
    shares: base.shares,
    status: 'PENDING',
    note: base.note,
  };
}

/**
 * 提交买入。校验现金充足后冻结金额并创建 PENDING 订单。
 * 现金在下单时即扣除（模拟券商冻结），结算时只计算份额。
 */
export function submitBuy(
  portfolio: Portfolio,
  params: BuyParams,
  calendar: TradingCalendar,
): Order {
  const amount = roundAmount(params.amount);
  if (amount <= 0) throw new Error('买入金额必须大于 0');
  if (amount > portfolio.cash + 1e-6) {
    throw new Error(`可用现金不足：需要 ${amount}，可用 ${portfolio.cash}`);
  }
  portfolio.cash = roundAmount(portfolio.cash - amount);
  const order = makeOrder(
    'BUY',
    { fundCode: params.fundCode, amount, note: params.note },
    params.submitAt,
    calendar,
  );
  portfolio.pendingOrders.push(order);
  return order;
}

/** 提交卖出。校验可卖份额后冻结份额并创建 PENDING 订单。 */
export function submitSell(
  portfolio: Portfolio,
  params: SellParams,
  calendar: TradingCalendar,
): Order {
  const shares = roundShares(params.shares);
  if (shares <= 0) throw new Error('卖出份额必须大于 0');
  const pos = portfolio.positions.find((p) => p.fundCode === params.fundCode);
  if (!pos || roundShares(pos.availableShares) < shares) {
    throw new Error(`可卖份额不足：需要 ${shares}，可卖 ${pos?.availableShares ?? 0}`);
  }
  // 冻结可卖份额（持仓份额在结算时才真正扣减）
  pos.availableShares = roundShares(pos.availableShares - shares);
  const order = makeOrder(
    'SELL',
    { fundCode: params.fundCode, shares, note: params.note },
    params.submitAt,
    calendar,
  );
  portfolio.pendingOrders.push(order);
  return order;
}

/** 提交转换。校验转出基金可卖份额，冻结份额并创建 PENDING 订单。 */
export function submitConvert(
  portfolio: Portfolio,
  params: ConvertParams,
  calendar: TradingCalendar,
): Order {
  const shares = roundShares(params.shares);
  if (shares <= 0) throw new Error('转换份额必须大于 0');
  if (params.fromFundCode === params.toFundCode) throw new Error('转入转出基金不能相同');
  const pos = portfolio.positions.find((p) => p.fundCode === params.fromFundCode);
  if (!pos || roundShares(pos.availableShares) < shares) {
    throw new Error(`可转份额不足：需要 ${shares}，可转 ${pos?.availableShares ?? 0}`);
  }
  pos.availableShares = roundShares(pos.availableShares - shares);
  // 预建目标持仓，便于后续展示
  getOrCreatePosition(portfolio, params.toFundCode);
  const order = makeOrder(
    'CONVERT',
    {
      fundCode: params.fromFundCode,
      targetFundCode: params.toFundCode,
      shares,
      note: params.note,
    },
    params.submitAt,
    calendar,
  );
  portfolio.pendingOrders.push(order);
  return order;
}

/** 撤单（仅 PENDING 可撤），解冻已冻结的现金/份额。 */
export function cancelOrder(portfolio: Portfolio, orderId: string): void {
  const idx = portfolio.pendingOrders.findIndex((o) => o.id === orderId);
  if (idx < 0) throw new Error(`未找到待确认订单: ${orderId}`);
  const order = portfolio.pendingOrders[idx];
  if (order.status !== 'PENDING') throw new Error('仅可撤销待确认订单');

  if (order.type === 'BUY' && order.amount) {
    portfolio.cash = roundAmount(portfolio.cash + order.amount);
  } else if ((order.type === 'SELL' || order.type === 'CONVERT') && order.shares) {
    const pos = portfolio.positions.find((p) => p.fundCode === order.fundCode);
    if (pos) pos.availableShares = roundShares(pos.availableShares + order.shares);
  }
  order.status = 'CANCELLED';
  portfolio.pendingOrders.splice(idx, 1);
}
