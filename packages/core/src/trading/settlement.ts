import type { Order, Portfolio, Transaction } from '../domain';
import { generateId } from '../utils/id';
import { roundAmount, roundShares } from '../utils/decimal';
import { dateLte } from '../utils/date';
import { calcPurchase, calcRedeem, calcConvertOut, calcConvertInShares } from './fees';
import { getOrCreatePosition, pruneEmptyPositions } from './portfolio-factory';
import type { NavProvider, FundInfoProvider } from './providers';
import type { TradingCalendar } from './calendar';

export interface SettlementContext {
  /** 当前日期（驱动结算/到账），'YYYY-MM-DD' */
  asOf: string;
  calendar: TradingCalendar;
  getNav: NavProvider;
  getFundInfo: FundInfoProvider;
}

export interface SettlementResult {
  confirmedOrders: Order[];
  transactions: Transaction[];
  /** 仍未结算（净值未公布）的订单数 */
  stillPending: number;
}

/**
 * 推进组合到 asOf 日：
 *  1. 释放在途份额（availableDate <= asOf）→ 增加可卖份额；
 *  2. 释放在途资金（availableDate <= asOf）→ 增加可用现金；
 *  3. 结算「份额确认日（shareConfirmDate, T+N）<= asOf」且成交净值（confirmDate/T 净值）已可得的 PENDING 订单。
 *
 * 场外基金规则：T 日按收盘净值成交，份额在 T+N 日确认（普通 T+1，QDII/港基/FOF 更久）。
 * 在份额确认前订单保持「待确认」，确认后才计入持仓。该函数幂等，多次调用安全。
 */
export function settlePortfolio(portfolio: Portfolio, ctx: SettlementContext): SettlementResult {
  const confirmedOrders: Order[] = [];
  const newTxns: Transaction[] = [];
  const remaining: Order[] = [];

  // 按份额确认日排序，保证先确认的先结算（影响现金可用顺序）
  const ordered = [...portfolio.pendingOrders].sort((a, b) => {
    const ka = shareConfirmDateOf(a);
    const kb = shareConfirmDateOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  for (const order of ordered) {
    if (order.status !== 'PENDING') continue;
    // 份额确认日未到 → 保持「待确认」
    if (!dateLte(shareConfirmDateOf(order), ctx.asOf)) {
      remaining.push(order);
      continue;
    }
    const settled = trySettleOrder(portfolio, order, ctx);
    if (settled) {
      order.status = 'CONFIRMED';
      confirmedOrders.push(order);
      newTxns.push(...settled);
    } else {
      // 份额确认日已到但成交净值尚不可得，保持 pending
      remaining.push(order);
    }
  }

  portfolio.pendingOrders = remaining;
  portfolio.transactions.push(...newTxns);

  // 订单确认后再释放到期的在途资金/份额：保证当日确认的卖出回款若已到到账日可同日释放，
  // 同时兼容旧数据中遗留的 pendingShares（新流程买入/转入在确认时即直接到账）。
  releasePendingShares(portfolio, ctx.asOf);
  releasePendingCash(portfolio, ctx.asOf);

  pruneEmptyPositions(portfolio);

  return {
    confirmedOrders,
    transactions: newTxns,
    stillPending: remaining.length,
  };
}

/** 取份额确认日；兼容旧数据（缺失时回退成交日 confirmDate）。 */
function shareConfirmDateOf(order: Order): string {
  return order.shareConfirmDate ?? order.confirmDate;
}

function releasePendingShares(portfolio: Portfolio, asOf: string): void {
  const due = portfolio.pendingShares.filter((p) => dateLte(p.availableDate, asOf));
  for (const ps of due) {
    const pos = getOrCreatePosition(portfolio, ps.fundCode);
    pos.availableShares = roundShares(pos.availableShares + ps.shares);
  }
  portfolio.pendingShares = portfolio.pendingShares.filter((p) => !dateLte(p.availableDate, asOf));
}

function releasePendingCash(portfolio: Portfolio, asOf: string): void {
  const due = portfolio.pendingCash.filter((p) => dateLte(p.availableDate, asOf));
  for (const pc of due) {
    portfolio.cash = roundAmount(portfolio.cash + pc.amount);
  }
  portfolio.pendingCash = portfolio.pendingCash.filter((p) => !dateLte(p.availableDate, asOf));
}

/** 结算单个订单。净值不可得返回 null。 */
function trySettleOrder(
  portfolio: Portfolio,
  order: Order,
  ctx: SettlementContext,
): Transaction[] | null {
  switch (order.type) {
    case 'BUY':
      return settleBuy(portfolio, order, ctx);
    case 'SELL':
      return settleSell(portfolio, order, ctx);
    case 'CONVERT':
      return settleConvert(portfolio, order, ctx);
    default:
      return null;
  }
}

function settleBuy(portfolio: Portfolio, order: Order, ctx: SettlementContext): Transaction[] | null {
  const nav = ctx.getNav(order.fundCode, order.confirmDate);
  if (nav === undefined) return null;

  const info = ctx.getFundInfo(order.fundCode);
  const { fee, shares } = calcPurchase(order.amount!, info.purchaseFeeRate, nav);

  const pos = getOrCreatePosition(portfolio, order.fundCode);
  pos.shares = roundShares(pos.shares + shares);
  pos.cost = roundAmount(pos.cost + order.amount!); // 成本含申购费（总投入口径）
  pos.lots.push({ acquiredDate: order.confirmDate, shares, nav });

  // 结算发生在份额确认日（T+N），份额此刻确认到账即可赎回
  pos.availableShares = roundShares(pos.availableShares + shares);

  return [
    {
      id: generateId('txn'),
      type: 'BUY',
      fundCode: order.fundCode,
      date: order.confirmDate,
      nav,
      amount: order.amount!,
      shares,
      fee,
      note: order.note,
    },
  ];
}

function settleSell(
  portfolio: Portfolio,
  order: Order,
  ctx: SettlementContext,
): Transaction[] | null {
  const nav = ctx.getNav(order.fundCode, order.confirmDate);
  if (nav === undefined) return null;

  const info = ctx.getFundInfo(order.fundCode);
  const pos = getOrCreatePosition(portfolio, order.fundCode);
  const sellShares = roundShares(order.shares!);

  const { netAmount, fee, remainingLots } = calcRedeem(
    pos.lots,
    sellShares,
    nav,
    info.redeemFeeTiers,
    order.confirmDate,
  );

  // 扣减持仓份额（可卖份额已在下单时冻结）
  const costReduction = pos.shares > 0 ? roundAmount((pos.cost * sellShares) / pos.shares) : 0;
  pos.shares = roundShares(pos.shares - sellShares);
  pos.cost = roundAmount(Math.max(0, pos.cost - costReduction));
  pos.lots = remainingLots;

  // 资金到账日 = max(成交日 T + settleLagDays, 份额确认日)，保证不早于确认时点
  const lagDate = ctx.calendar.addTradingDays(order.confirmDate, info.settleLagDays);
  const confirmDate = order.shareConfirmDate ?? order.confirmDate;
  const availableDate = dateLte(confirmDate, lagDate) ? lagDate : confirmDate;
  portfolio.pendingCash.push({
    id: generateId('pc'),
    availableDate,
    amount: netAmount,
    sourceOrderId: order.id,
  });

  return [
    {
      id: generateId('txn'),
      type: 'SELL',
      fundCode: order.fundCode,
      date: order.confirmDate,
      nav,
      amount: netAmount,
      shares: sellShares,
      fee,
      note: order.note,
    },
  ];
}

function settleConvert(
  portfolio: Portfolio,
  order: Order,
  ctx: SettlementContext,
): Transaction[] | null {
  const fromNav = ctx.getNav(order.fundCode, order.confirmDate);
  const toNav = ctx.getNav(order.targetFundCode!, order.confirmDate);
  if (fromNav === undefined || toNav === undefined) return null;

  const info = ctx.getFundInfo(order.fundCode);
  const fromPos = getOrCreatePosition(portfolio, order.fundCode);
  const toPos = getOrCreatePosition(portfolio, order.targetFundCode!);
  const convShares = roundShares(order.shares!);

  // 转出（按转出基金赎回，使用转换费率）
  const { netAmount, fee } = calcConvertOut(convShares, fromNav, info.convertFeeRate);

  // 扣减源持仓
  const costReduction =
    fromPos.shares > 0 ? roundAmount((fromPos.cost * convShares) / fromPos.shares) : 0;
  // FIFO 扣减源 lots
  fromPos.lots = consumeLotsFifo(fromPos.lots, convShares);
  fromPos.shares = roundShares(fromPos.shares - convShares);
  fromPos.cost = roundAmount(Math.max(0, fromPos.cost - costReduction));

  // 转入目标基金
  const inShares = calcConvertInShares(netAmount, toNav);
  toPos.shares = roundShares(toPos.shares + inShares);
  toPos.cost = roundAmount(toPos.cost + netAmount);
  toPos.lots.push({ acquiredDate: order.confirmDate, shares: inShares, nav: toNav });

  // 结算发生在份额确认日（T+N），转入份额此刻确认到账即可赎回
  toPos.availableShares = roundShares(toPos.availableShares + inShares);

  return [
    {
      id: generateId('txn'),
      type: 'CONVERT',
      fundCode: order.fundCode,
      targetFundCode: order.targetFundCode,
      date: order.confirmDate,
      nav: fromNav,
      amount: netAmount,
      shares: convShares,
      fee,
      note: order.note ?? `转换至 ${order.targetFundCode}，转入 ${inShares} 份`,
    },
  ];
}

/** FIFO 扣减 lots，返回剩余 lots */
function consumeLotsFifo(lots: Portfolio['positions'][number]['lots'], shares: number) {
  const remaining = lots.map((l) => ({ ...l }));
  let toConsume = shares;
  for (const lot of remaining) {
    if (toConsume <= 0) break;
    const take = Math.min(lot.shares, toConsume);
    lot.shares = roundShares(lot.shares - take);
    toConsume = roundShares(toConsume - take);
  }
  return remaining.filter((l) => l.shares > 0);
}
