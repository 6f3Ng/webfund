import { describe, it, expect } from 'vitest';
import { TradingCalendar } from './calendar';
import { createPortfolio } from './portfolio-factory';
import { submitBuy, submitSell, submitConvert, cancelOrder } from './operations';
import { settlePortfolio, type SettlementContext } from './settlement';
import { snapshotPortfolio } from './valuation-calc';
import { createDefaultFundInfo, type FundInfo } from '../domain';

const cal = new TradingCalendar();

// 净值表：基金 → 日期 → 净值
const navTable: Record<string, Record<string, number>> = {
  '000001': {
    '2024-06-03': 2.0,
    '2024-06-04': 2.1,
    '2024-06-05': 2.2,
    '2024-06-06': 2.15,
  },
  '000002': {
    '2024-06-04': 1.5,
    '2024-06-05': 1.6,
  },
};

const fundInfos: Record<string, FundInfo> = {
  '000001': { ...createDefaultFundInfo('000001', '基金A', 'HYBRID'), settleLagDays: 1 },
  '000002': { ...createDefaultFundInfo('000002', '基金B', 'INDEX'), settleLagDays: 2 },
};

function ctx(asOf: string): SettlementContext {
  return {
    asOf,
    calendar: cal,
    getNav: (code, date) => navTable[code]?.[date],
    getFundInfo: (code) => fundInfos[code] ?? createDefaultFundInfo(code),
  };
}

describe('settlement - 买入流程', () => {
  it('15:00 前买入当日确认，份额 T+1 可卖', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, cal);

    // 下单即冻结现金
    expect(pf.cash).toBe(90000);
    expect(pf.pendingOrders).toHaveLength(1);
    expect(pf.pendingOrders[0].confirmDate).toBe('2024-06-03');

    // 推进到 06-03 结算
    const r = settlePortfolio(pf, ctx('2024-06-03'));
    expect(r.confirmedOrders).toHaveLength(1);
    expect(pf.transactions).toHaveLength(1);

    const pos = pf.positions.find((p) => p.fundCode === '000001')!;
    // 净申购 = 10000/1.015 = 9852.22, 份额 = 9852.22/2 = 4926.11
    expect(pos.shares).toBe(4926.11);
    expect(pos.cost).toBe(10000); // 成本含费
    // 当日份额未到账，不可卖
    expect(pos.availableShares).toBe(0);

    // 推进到 06-04，份额到账可卖
    settlePortfolio(pf, ctx('2024-06-04'));
    expect(pos.availableShares).toBe(4926.11);
  });

  it('现金不足拒绝买入', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 5000 });
    expect(() =>
      submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, cal),
    ).toThrow();
  });

  it('确认日净值未公布则保持 PENDING', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-06T16:00' }, cal);
    // 确认日 = 06-07，无净值
    const r = settlePortfolio(pf, ctx('2024-06-07'));
    expect(r.confirmedOrders).toHaveLength(0);
    expect(r.stillPending).toBe(1);
  });
});

describe('settlement - 卖出流程', () => {
  it('卖出后资金 T+N 到账', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, cal);
    settlePortfolio(pf, ctx('2024-06-03'));
    settlePortfolio(pf, ctx('2024-06-04')); // 份额到账

    const pos = pf.positions.find((p) => p.fundCode === '000001')!;
    const shares = pos.availableShares;
    expect(shares).toBeGreaterThan(0);

    // 06-04 15:00 前卖出，确认日 06-04，净值 2.1
    submitSell(pf, { fundCode: '000001', shares, submitAt: '2024-06-04T10:00' }, cal);
    expect(pos.availableShares).toBe(0); // 冻结

    const cashBefore = pf.cash;
    settlePortfolio(pf, ctx('2024-06-04'));
    // 资金未到账（T+1 = 06-05）
    expect(pf.cash).toBe(cashBefore);
    expect(pf.pendingCash).toHaveLength(1);
    expect(pf.pendingCash[0].availableDate).toBe('2024-06-05');
    expect(pos.shares).toBe(0); // 持仓清空

    // 推进到 06-05，资金到账
    settlePortfolio(pf, ctx('2024-06-05'));
    expect(pf.pendingCash).toHaveLength(0);
    expect(pf.cash).toBeGreaterThan(cashBefore);
  });

  it('可卖份额不足拒绝卖出', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    expect(() =>
      submitSell(pf, { fundCode: '000001', shares: 100, submitAt: '2024-06-04T10:00' }, cal),
    ).toThrow();
  });
});

describe('settlement - 转换流程', () => {
  it('A 转 B：源减份额，目标增份额', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, cal);
    settlePortfolio(pf, ctx('2024-06-03'));
    settlePortfolio(pf, ctx('2024-06-04'));

    const posA = pf.positions.find((p) => p.fundCode === '000001')!;
    const convShares = posA.availableShares;

    // 06-04 转换，确认日 06-04，A 净值 2.1，B 净值 1.5
    submitConvert(
      pf,
      { fromFundCode: '000001', toFundCode: '000002', shares: convShares, submitAt: '2024-06-04T10:00' },
      cal,
    );
    settlePortfolio(pf, ctx('2024-06-04'));

    expect(posA.shares).toBe(0);
    const posB = pf.positions.find((p) => p.fundCode === '000002')!;
    expect(posB.shares).toBeGreaterThan(0);
    // 转入份额 T+1 可卖
    expect(posB.availableShares).toBe(0);
    settlePortfolio(pf, ctx('2024-06-05'));
    expect(posB.availableShares).toBe(posB.shares);
  });
});

describe('settlement - 撤单', () => {
  it('撤销买入订单解冻现金', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    const order = submitBuy(
      pf,
      { fundCode: '000001', amount: 10000, submitAt: '2024-06-06T16:00' },
      cal,
    );
    expect(pf.cash).toBe(90000);
    cancelOrder(pf, order.id);
    expect(pf.cash).toBe(100000);
    expect(pf.pendingOrders).toHaveLength(0);
  });
});

describe('valuation-calc 收益快照', () => {
  it('计算市值/收益/当日盈亏/总资产', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, cal);
    settlePortfolio(pf, ctx('2024-06-03'));

    const pos = pf.positions.find((p) => p.fundCode === '000001')!;
    const shares = pos.shares; // 4926.11

    // 估值 2.2，前一日 2.1
    const snap = snapshotPortfolio(pf, { '000001': { nav: 2.2, prevNav: 2.1 } });
    expect(snap.cash).toBe(90000);
    expect(snap.marketValue).toBe(Number((shares * 2.2).toFixed(2)));
    // 总资产 = 现金 + 市值
    expect(snap.totalAssets).toBe(Number((90000 + shares * 2.2).toFixed(2)));
    // 当日盈亏 = shares * (2.2 - 2.1)
    expect(snap.dayProfit).toBe(Number((shares * 0.1).toFixed(2)));
    // 持仓收益 = 市值 - 成本(10000)
    expect(snap.positions[0].profit).toBe(Number((shares * 2.2 - 10000).toFixed(2)));
  });

  it('盈利场景总收益为正', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    submitBuy(pf, { fundCode: '000001', amount: 50000, submitAt: '2024-06-03T10:00' }, cal);
    settlePortfolio(pf, ctx('2024-06-03'));
    // 净值从 2.0 涨到 2.5
    const snap = snapshotPortfolio(pf, { '000001': { nav: 2.5, prevNav: 2.2 } });
    expect(snap.totalProfit).toBeGreaterThan(0);
    expect(snap.totalProfitRate).toBeGreaterThan(0);
  });
});
