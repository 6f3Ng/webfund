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
  it('15:00 前买入：成交日 T 确认份额于 T+1，确认即可卖', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, cal);

    // 下单即冻结现金
    expect(pf.cash).toBe(90000);
    expect(pf.pendingOrders).toHaveLength(1);
    expect(pf.pendingOrders[0].confirmDate).toBe('2024-06-03'); // 成交净值日 T
    expect(pf.pendingOrders[0].shareConfirmDate).toBe('2024-06-04'); // 份额确认日 T+1

    // 推进到成交日 06-03：份额确认日（06-04）未到 → 仍待确认，无持仓
    const r0 = settlePortfolio(pf, ctx('2024-06-03'));
    expect(r0.confirmedOrders).toHaveLength(0);
    expect(r0.stillPending).toBe(1);
    expect(pf.positions.find((p) => p.fundCode === '000001')).toBeUndefined();

    // 推进到 06-04（T+1）：份额确认，计入持仓且确认即可卖
    const r = settlePortfolio(pf, ctx('2024-06-04'));
    expect(r.confirmedOrders).toHaveLength(1);
    expect(pf.transactions).toHaveLength(1);

    const pos = pf.positions.find((p) => p.fundCode === '000001')!;
    // 成交净值取成交日 T(06-03) = 2.0：净申购 = 10000/1.015 = 9852.22, 份额 = 4926.11
    expect(pos.shares).toBe(4926.11);
    expect(pos.cost).toBe(10000); // 成本含费
    // 确认即到账可卖
    expect(pos.availableShares).toBe(4926.11);
  });

  it('现金不足拒绝买入', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 5000 });
    expect(() =>
      submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, cal),
    ).toThrow();
  });

  it('份额确认日已到但成交净值未公布则保持 PENDING', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-06T16:00' }, cal);
    // 成交日 = 06-07，份额确认日 = 06-10（06-08/09 为周末），无 06-07 净值
    const r = settlePortfolio(pf, ctx('2024-06-10'));
    expect(r.confirmedOrders).toHaveLength(0);
    expect(r.stillPending).toBe(1);
  });

  it('QDII/FOF 等特殊产品按更长确认期（T+2）保持待确认', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    // 显式指定 T+2 确认（如 QDII）
    submitBuy(
      pf,
      { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' },
      cal,
      { confirmLagDays: 2 },
    );
    expect(pf.pendingOrders[0].shareConfirmDate).toBe('2024-06-05'); // T+2

    // 06-04（T+1）尚未到确认日 → 仍待确认
    expect(settlePortfolio(pf, ctx('2024-06-04')).confirmedOrders).toHaveLength(0);
    expect(pf.pendingOrders).toHaveLength(1);

    // 06-05（T+2）确认
    expect(settlePortfolio(pf, ctx('2024-06-05')).confirmedOrders).toHaveLength(1);
    const pos = pf.positions.find((p) => p.fundCode === '000001')!;
    expect(pos.availableShares).toBe(4926.11);
  });
});

describe('settlement - 卖出流程', () => {
  it('卖出在 T+1 确认，资金 T+N 到账', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, cal);
    settlePortfolio(pf, ctx('2024-06-03'));
    settlePortfolio(pf, ctx('2024-06-04')); // 买入确认（T+1），份额可卖

    const pos = pf.positions.find((p) => p.fundCode === '000001')!;
    const shares = pos.availableShares;
    expect(shares).toBeGreaterThan(0);

    // 06-04 15:00 前卖出，成交日 06-04，份额确认日 06-05
    submitSell(pf, { fundCode: '000001', shares, submitAt: '2024-06-04T10:00' }, cal);
    expect(pos.availableShares).toBe(0); // 冻结

    const cashBefore = pf.cash;
    // 成交日当天结算：份额确认日（06-05）未到 → 仍待确认
    const r0 = settlePortfolio(pf, ctx('2024-06-04'));
    expect(r0.confirmedOrders).toHaveLength(0);
    expect(pos.shares).toBeGreaterThan(0); // 份额未扣减
    expect(pf.cash).toBe(cashBefore);

    // 推进到 06-05：卖出确认（份额扣减），资金到账（T+N，N=1 → 06-05）
    settlePortfolio(pf, ctx('2024-06-05'));
    expect(pos.shares).toBe(0); // 持仓清空
    expect(pf.cash).toBeGreaterThan(cashBefore); // 资金已到账
    expect(pf.pendingCash).toHaveLength(0);
  });

  it('可卖份额不足拒绝卖出', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    expect(() =>
      submitSell(pf, { fundCode: '000001', shares: 100, submitAt: '2024-06-04T10:00' }, cal),
    ).toThrow();
  });
});

describe('settlement - 转换流程', () => {
  it('A 转 B：源减份额，目标增份额（T+1 确认即可卖）', () => {
    const pf = createPortfolio({ name: 'T', initialCash: 100000 });
    submitBuy(pf, { fundCode: '000001', amount: 10000, submitAt: '2024-06-03T10:00' }, cal);
    settlePortfolio(pf, ctx('2024-06-03'));
    settlePortfolio(pf, ctx('2024-06-04')); // 买入确认

    const posA = pf.positions.find((p) => p.fundCode === '000001')!;
    const convShares = posA.availableShares;

    // 06-04 转换，成交日 06-04（A=2.1, B=1.5），份额确认日 06-05
    submitConvert(
      pf,
      { fromFundCode: '000001', toFundCode: '000002', shares: convShares, submitAt: '2024-06-04T10:00' },
      cal,
    );
    // 成交日当天：未到确认日 → 仍待确认
    settlePortfolio(pf, ctx('2024-06-04'));
    expect(posA.shares).toBeGreaterThan(0);

    // 06-05 确认：源清空，目标到账可卖
    settlePortfolio(pf, ctx('2024-06-05'));
    expect(posA.shares).toBe(0);
    const posB = pf.positions.find((p) => p.fundCode === '000002')!;
    expect(posB.shares).toBeGreaterThan(0);
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
    settlePortfolio(pf, ctx('2024-06-04')); // T+1 份额确认

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
    settlePortfolio(pf, ctx('2024-06-04')); // T+1 份额确认
    // 净值从 2.0 涨到 2.5
    const snap = snapshotPortfolio(pf, { '000001': { nav: 2.5, prevNav: 2.2 } });
    expect(snap.totalProfit).toBeGreaterThan(0);
    expect(snap.totalProfitRate).toBeGreaterThan(0);
  });
});
