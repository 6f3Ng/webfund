import type { Order, Portfolio, TransactionType } from '../domain';
import { NAV_CUTOFF_HOUR, NAV_CUTOFF_MINUTE } from '../domain/constants';
import { generateId } from '../utils/id';
import { roundAmount, roundShares } from '../utils/decimal';
import { parseSubmitDateTime } from '../utils/date';
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

/** 下单可选项：份额确认滞后交易日数（T+N 确认），缺省按场外基金兜底 T+1。 */
export interface SubmitOptions {
  /** 份额确认滞后交易日数（>=1）；QDII/港基/FOF 等更久，无信息时兜底 1（T+1） */
  confirmLagDays?: number;
}

/** 默认份额确认滞后：兜底 T+1。 */
const DEFAULT_CONFIRM_LAG_DAYS = 1;

function makeOrder(
  type: TransactionType,
  base: Partial<Order>,
  submitAt: string,
  calendar: TradingCalendar,
  confirmLagDays: number,
): Order {
  const confirmDate = calcConfirmDate(submitAt, calendar); // 成交净值日 T
  const lag = Math.max(1, Math.floor(confirmLagDays || DEFAULT_CONFIRM_LAG_DAYS));
  return {
    id: generateId('ord'),
    type,
    fundCode: base.fundCode!,
    targetFundCode: base.targetFundCode,
    submitAt,
    confirmDate,
    // 份额确认日 = 成交日 T 之后第 lag 个交易日（T+N 确认）
    shareConfirmDate: calendar.addTradingDays(confirmDate, lag),
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
  options?: SubmitOptions,
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
    options?.confirmLagDays ?? DEFAULT_CONFIRM_LAG_DAYS,
  );
  portfolio.pendingOrders.push(order);
  return order;
}

/** 提交卖出。校验可卖份额后冻结份额并创建 PENDING 订单。 */
export function submitSell(
  portfolio: Portfolio,
  params: SellParams,
  calendar: TradingCalendar,
  options?: SubmitOptions,
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
    options?.confirmLagDays ?? DEFAULT_CONFIRM_LAG_DAYS,
  );
  portfolio.pendingOrders.push(order);
  return order;
}

/** 提交转换。校验转出基金可卖份额，冻结份额并创建 PENDING 订单。 */
export function submitConvert(
  portfolio: Portfolio,
  params: ConvertParams,
  calendar: TradingCalendar,
  options?: SubmitOptions,
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
    options?.confirmLagDays ?? DEFAULT_CONFIRM_LAG_DAYS,
  );
  portfolio.pendingOrders.push(order);
  return order;
}

/**
 * 按场外基金运作限制判断订单当前是否仍可撤单。
 *
 * 真实场外基金规则：申报后在「确认日 15:00（成交净值确认时点）」之前可撤单；
 * 一旦到达确认日 15:00，份额/资金按当日净值确认成交，不可再撤。
 *  - 申报时间 15:00 前（交易日）→ 确认日 = 当日，可撤窗口 = 当日 0:00 ~ 15:00；
 *  - 申报时间 15:00 后或非交易日 → 确认日 = 下一交易日，可撤窗口至确认日 15:00。
 *
 * @param order 待判断订单（仅 PENDING 有意义）
 * @param now   当前时间，'YYYY-MM-DD[THH:mm]'（按市场墙钟时间）
 * @returns 当前是否允许撤单
 */
export function isOrderCancellable(order: Order, now: string): boolean {
  if (order.status !== 'PENDING') return false;
  const { date, hour, minute } = parseSubmitDateTime(now);
  // 当前日期早于确认日 → 净值尚未确认，可撤
  if (date < order.confirmDate) return true;
  // 已过确认日 → 不可撤
  if (date > order.confirmDate) return false;
  // 恰为确认日：仅 15:00（成交确认时点）之前可撤
  return hour < NAV_CUTOFF_HOUR || (hour === NAV_CUTOFF_HOUR && minute < NAV_CUTOFF_MINUTE);
}

/**
 * 撤单（仅 PENDING 可撤），解冻已冻结的现金/份额。
 *
 * 传入 `options.now` 时按场外基金运作限制校验（确认日 15:00 前可撤），
 * 已过成交确认时点则拒绝撤单；不传 `now` 时保持「仅校验 PENDING」的宽松行为。
 */
export function cancelOrder(
  portfolio: Portfolio,
  orderId: string,
  options?: { now?: string },
): void {
  const idx = portfolio.pendingOrders.findIndex((o) => o.id === orderId);
  if (idx < 0) throw new Error(`未找到待确认订单: ${orderId}`);
  const order = portfolio.pendingOrders[idx];
  if (order.status !== 'PENDING') throw new Error('仅可撤销待确认订单');
  if (options?.now && !isOrderCancellable(order, options.now)) {
    throw new Error('已过确认截止时点（确认日 15:00），该订单不可撤单');
  }

  if (order.type === 'BUY' && order.amount) {
    portfolio.cash = roundAmount(portfolio.cash + order.amount);
  } else if ((order.type === 'SELL' || order.type === 'CONVERT') && order.shares) {
    const pos = portfolio.positions.find((p) => p.fundCode === order.fundCode);
    if (pos) pos.availableShares = roundShares(pos.availableShares + order.shares);
  }
  order.status = 'CANCELLED';
  portfolio.pendingOrders.splice(idx, 1);
}
