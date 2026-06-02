import { describe, it, expect } from 'vitest';
import { TradingCalendar } from './calendar';
import { createPortfolio } from './portfolio-factory';
import { submitBuy, submitSell, cancelOrder, isOrderCancellable } from './operations';

// 2024-06 无 A 股节假日的普通工作日：6-03(周一) 6-04(周二)
const calendar = new TradingCalendar();

describe('isOrderCancellable（场外基金撤单限制）', () => {
  it('15:00 前下单当日确认，确认日 15:00 前可撤、之后不可撤', () => {
    const pf = createPortfolio({ name: 'p', initialCash: 100000 });
    const order = submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, calendar);
    expect(order.confirmDate).toBe('2024-06-03');
    // 同日 14:59 可撤
    expect(isOrderCancellable(order, '2024-06-03T14:59')).toBe(true);
    // 同日 15:00 起不可撤（成交确认时点）
    expect(isOrderCancellable(order, '2024-06-03T15:00')).toBe(false);
    expect(isOrderCancellable(order, '2024-06-03T16:00')).toBe(false);
    // 次日不可撤
    expect(isOrderCancellable(order, '2024-06-04T09:00')).toBe(false);
  });

  it('15:00 后下单顺延至下一交易日，次日 15:00 前仍可撤', () => {
    const pf = createPortfolio({ name: 'p', initialCash: 100000 });
    const order = submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T15:30' }, calendar);
    expect(order.confirmDate).toBe('2024-06-04');
    // 下单当晚可撤
    expect(isOrderCancellable(order, '2024-06-03T20:00')).toBe(true);
    // 确认日 09:30 仍可撤
    expect(isOrderCancellable(order, '2024-06-04T09:30')).toBe(true);
    // 确认日 15:00 起不可撤
    expect(isOrderCancellable(order, '2024-06-04T15:00')).toBe(false);
  });

  it('非 PENDING 订单不可撤', () => {
    const pf = createPortfolio({ name: 'p', initialCash: 100000 });
    const order = submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, calendar);
    order.status = 'CONFIRMED';
    expect(isOrderCancellable(order, '2024-06-03T10:01')).toBe(false);
  });
});

describe('cancelOrder 校验', () => {
  it('传入 now 且已过确认截止时点时拒绝撤单，集合不变', () => {
    const pf = createPortfolio({ name: 'p', initialCash: 100000 });
    const order = submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, calendar);
    expect(pf.cash).toBe(90000);
    expect(() => cancelOrder(pf, order.id, { now: '2024-06-03T15:30' })).toThrow(/不可撤单/);
    // 拒绝后状态不变：现金仍冻结、订单仍在
    expect(pf.cash).toBe(90000);
    expect(pf.pendingOrders).toHaveLength(1);
  });

  it('传入 now 且在可撤窗口内时正常撤单并解冻现金', () => {
    const pf = createPortfolio({ name: 'p', initialCash: 100000 });
    const order = submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, calendar);
    cancelOrder(pf, order.id, { now: '2024-06-03T11:00' });
    expect(pf.cash).toBe(100000);
    expect(pf.pendingOrders).toHaveLength(0);
  });

  it('卖出撤单解冻可卖份额（可撤窗口内）', () => {
    const pf = createPortfolio({
      name: 'p',
      initialCash: 0,
      positions: [{ fundCode: '000001', shares: 1000, costPrice: 1.0 }],
    });
    const order = submitSell(pf, { fundCode: '000001', shares: 500, submitAt: '2024-06-03T10:00' }, calendar);
    expect(pf.positions[0].availableShares).toBe(500);
    cancelOrder(pf, order.id, { now: '2024-06-03T11:00' });
    expect(pf.positions[0].availableShares).toBe(1000);
  });

  it('不传 now 时保持宽松行为（向后兼容）', () => {
    const pf = createPortfolio({ name: 'p', initialCash: 100000 });
    const order = submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, calendar);
    // 即使已过截止时点，不传 now 仍可撤（兼容旧调用）
    cancelOrder(pf, order.id);
    expect(pf.cash).toBe(100000);
  });
});
