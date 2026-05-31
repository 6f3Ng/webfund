import type { FundCode, NavPoint } from '../domain';
import { roundAmount, roundShares, roundRate } from '../utils/decimal';
import { dateLte } from '../utils/date';
import { evaluateStrategy } from './evaluators';
import { mergeActions } from './conflict';
import {
  maxDrawdown,
  holdingMaxDrawdown,
  totalReturn,
  annualizedReturn,
  drawdownDetail,
  dailyReturns,
  annualizedVolatility,
  sharpeRatio,
  sortinoRatio,
  calmarRatio,
  winningDaysRatio,
} from './metrics';
import type {
  DayContext,
  PositionView,
  StrategyAction,
  StrategyRuntimeState,
} from './types';
import type {
  BacktestInput,
  BacktestResult,
  BacktestTrade,
  DailySnapshot,
  BenchmarkResult,
} from './backtest-types';

interface SimPosition {
  shares: number;
  cost: number;
}

/**
 * 回测引擎：按交易日逐日模拟策略集，使用历史净值同日成交（回测简化），
 * 应用统一申购/赎回费率，输出净值曲线、指标、成交流水与基准对比。
 */
export function runBacktest(input: BacktestInput): BacktestResult {
  const purchaseFee = input.purchaseFeeRate ?? 0.015;
  const redeemFee = input.redeemFeeRate ?? 0;

  // 1. 构建各基金在区间内的交易日序列（取并集，按日期升序）
  const navMaps = new Map<FundCode, Map<string, number>>();
  const dateSet = new Set<string>();
  for (const [code, points] of Object.entries(input.navData)) {
    const m = new Map<string, number>();
    for (const p of points) {
      if (dateLte(input.start, p.date) && dateLte(p.date, input.end)) {
        m.set(p.date, p.nav);
        dateSet.add(p.date);
      }
    }
    navMaps.set(code, m);
  }
  const tradingDates = [...dateSet].sort();

  // 每基金的升序净值序列（用于 navTradingDaysAgo / navHistory）
  const sortedNav = new Map<FundCode, NavPoint[]>();
  for (const [code, points] of Object.entries(input.navData)) {
    sortedNav.set(
      code,
      points
        .filter((p) => dateLte(p.date, input.end))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    );
  }

  // 2. 初始化模拟账户
  let cash = roundAmount(input.initialCash);
  const positions = new Map<FundCode, SimPosition>();
  const trades: BacktestTrade[] = [];
  const curve: DailySnapshot[] = [];
  const states = new Map<string, StrategyRuntimeState>();
  for (const s of input.strategies) states.set(s.id, {});

  // 资金流与累计统计
  let totalBought = 0; // 累计买入(含费)
  let totalSold = 0; // 累计卖出净额(扣费)
  let totalFee = 0; // 累计费用
  let netInvested = 0; // 累计净投入 = 买入 − 卖出回收
  // 时间加权持有指数（剥离现金稀释与资金流入）
  let holdingIndex = 1;
  let prevMarketValue = 0;

  const navOn = (code: FundCode, date: string): number | undefined => navMaps.get(code)?.get(date);

  // 3. 逐交易日循环
  for (let i = 0; i < tradingDates.length; i++) {
    const date = tradingDates[i];

    const ctx = buildContext(date, i, cash, positions, sortedNav, navOn);

    // 收集所有策略动作
    const rawActions: StrategyAction[] = [];
    for (const s of input.strategies) {
      const st = states.get(s.id)!;
      rawActions.push(...evaluateStrategy(s, ctx, st));
    }

    // 归并冲突（先卖后买）
    const merged = mergeActions(rawActions, input.conflictPolicy);

    // 当日净流入（买入金额 − 卖出回收），用于时间加权因子
    let dayBuy = 0;
    let daySell = 0;

    // 执行动作
    for (const action of merged) {
      const nav = navOn(action.fundCode, date);
      if (nav === undefined || nav <= 0) continue;

      if (action.side === 'SELL') {
        const pos = positions.get(action.fundCode);
        if (!pos || pos.shares <= 0) continue;
        // 卖出份额优先级：ratio（比例）> amount（金额，按净值换算）> shares（绝对份额）
        let sellShares: number;
        if (action.ratio !== undefined) {
          sellShares = pos.shares * action.ratio;
        } else if (action.amount !== undefined) {
          sellShares = action.amount / nav; // 卖出金额换算为份额（毛额口径）
        } else {
          sellShares = action.shares ?? 0;
        }
        sellShares = roundShares(Math.min(sellShares, pos.shares)); // 持仓不足则全卖
        if (sellShares <= 0) continue;

        const gross = sellShares * nav;
        const fee = roundAmount(gross * redeemFee);
        const net = roundAmount(gross - fee);
        const costReduction = roundAmount((pos.cost * sellShares) / pos.shares);
        pos.shares = roundShares(pos.shares - sellShares);
        pos.cost = roundAmount(Math.max(0, pos.cost - costReduction));
        cash = roundAmount(cash + net);
        totalSold = roundAmount(totalSold + net);
        totalFee = roundAmount(totalFee + fee);
        daySell = roundAmount(daySell + net);
        trades.push({
          date,
          fundCode: action.fundCode,
          side: 'SELL',
          nav,
          amount: net,
          shares: sellShares,
          fee,
          reason: action.reason,
        });
        if (pos.shares <= 1e-8) positions.delete(action.fundCode);
      } else {
        // BUY
        const amount = roundAmount(action.amount ?? 0);
        if (amount <= 0 || amount > cash) continue;
        const netAmount = roundAmount(amount / (1 + purchaseFee));
        const fee = roundAmount(amount - netAmount);
        const shares = roundShares(netAmount / nav);
        cash = roundAmount(cash - amount);
        const pos = positions.get(action.fundCode) ?? { shares: 0, cost: 0 };
        pos.shares = roundShares(pos.shares + shares);
        pos.cost = roundAmount(pos.cost + amount);
        positions.set(action.fundCode, pos);
        totalBought = roundAmount(totalBought + amount);
        totalFee = roundAmount(totalFee + fee);
        dayBuy = roundAmount(dayBuy + amount);
        trades.push({
          date,
          fundCode: action.fundCode,
          side: 'BUY',
          nav,
          amount,
          shares,
          fee,
          reason: action.reason,
        });
      }
    }

    netInvested = roundAmount(netInvested + dayBuy - daySell);

    // 记录当日快照（按当日净值计市值）
    const marketValue = computeMarketValue(positions, date, navOn);
    const holdingCost = roundAmount(
      [...positions.values()].reduce((acc, p) => acc + p.cost, 0),
    );

    // 时间加权持有指数：当日因子 = 市值 / (上一日市值 + 当日净流入)
    const dayNetFlow = roundAmount(dayBuy - daySell);
    const base = prevMarketValue + dayNetFlow;
    if (base > 1e-6 && marketValue > 0) {
      holdingIndex = holdingIndex * (marketValue / base);
    }
    prevMarketValue = marketValue;

    curve.push({
      date,
      cash,
      marketValue,
      cost: holdingCost,
      investedCapital: netInvested,
      holdingIndex: roundRate(holdingIndex),
      totalAssets: roundAmount(cash + marketValue),
    });
  }

  // 4. 指标
  const last = curve[curve.length - 1];
  const finalAssets = last ? last.totalAssets : input.initialCash;
  const finalCash = last ? last.cash : input.initialCash;
  const finalHoldingValue = last ? last.marketValue : 0;
  const finalHoldingCost = last ? last.cost : 0;
  const buyCount = trades.filter((t) => t.side === 'BUY').length;
  const sellCount = trades.length - buyCount;

  // 基于时间加权持有指数的风险指标
  const holdingSeries = curve.map((p) => p.holdingIndex);
  const holdReturns = dailyReturns(holdingSeries);
  const holdingRet = last ? roundRate(last.holdingIndex - 1) : 0;
  const holdingAnn = annualizedReturn(1, last ? last.holdingIndex : 1, input.start, input.end);
  const annVol = annualizedVolatility(holdReturns);
  const ddDetail = drawdownDetail(curve.map((p) => ({ date: p.date, value: p.holdingIndex })));
  const sharpe = sharpeRatio(holdingAnn, annVol, input.riskFreeRate ?? 0);
  const sortino = sortinoRatio(holdReturns, holdingAnn, input.riskFreeRate ?? 0);
  const calmar = calmarRatio(holdingAnn, ddDetail.maxDrawdown);
  const winRatio = winningDaysRatio(holdReturns);

  const metrics = {
    initialCash: input.initialCash,
    totalBought,
    totalSold,
    totalFee,
    netInvested,
    finalCash,
    finalHoldingValue,
    finalHoldingCost,
    finalAssets,
    holdingProfit: roundAmount(finalHoldingValue - finalHoldingCost),
    totalProfit: roundAmount(finalAssets - input.initialCash),
    totalReturn: totalReturn(input.initialCash, finalAssets),
    annualizedReturn: annualizedReturn(input.initialCash, finalAssets, input.start, input.end),
    holdingReturn: holdingRet,
    holdingAnnualizedReturn: holdingAnn,
    maxDrawdown: maxDrawdown(curve),
    holdingMaxDrawdown: holdingMaxDrawdown(curve),
    maxDrawdownPeakDate: ddDetail.peakDate,
    maxDrawdownTroughDate: ddDetail.troughDate,
    annualizedVolatility: annVol,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    calmarRatio: calmar,
    winningDaysRatio: winRatio,
    tradeCount: trades.length,
    buyCount,
    sellCount,
    tradingDays: tradingDates.length,
  };

  // 5. 基准（买入持有）
  const benchmarkCode = input.benchmarkFundCode ?? Object.keys(input.navData)[0];
  const benchmark = benchmarkCode
    ? buildBenchmark(
        benchmarkCode,
        tradingDates,
        navMaps,
        input.initialCash,
        purchaseFee,
        input.start,
        input.end,
      )
    : undefined;

  return { metrics, curve, trades, benchmark };
}

function buildContext(
  date: string,
  dayIndex: number,
  cash: number,
  positions: Map<FundCode, SimPosition>,
  sortedNav: Map<FundCode, NavPoint[]>,
  navOn: (code: FundCode, date: string) => number | undefined,
): DayContext {
  return {
    date,
    dayIndex,
    cash,
    navToday: (code) => navOn(code, date),
    navTradingDaysAgo: (code, n) => {
      const arr = sortedNav.get(code);
      if (!arr) return undefined;
      const idx = arr.findIndex((p) => p.date === date);
      if (idx < 0 || idx - n < 0) return undefined;
      return arr[idx - n].nav;
    },
    navHistory: (code) => {
      const arr = sortedNav.get(code) ?? [];
      return arr.filter((p) => dateLte(p.date, date));
    },
    position: (code): PositionView | undefined => {
      const pos = positions.get(code);
      if (!pos || pos.shares <= 0) return undefined;
      return {
        fundCode: code,
        shares: pos.shares,
        cost: pos.cost,
        avgCost: pos.cost / pos.shares,
      };
    },
  };
}

function computeMarketValue(
  positions: Map<FundCode, SimPosition>,
  date: string,
  navOn: (code: FundCode, date: string) => number | undefined,
): number {
  let mv = 0;
  for (const [code, pos] of positions) {
    const nav = navOn(code, date);
    if (nav !== undefined) mv += pos.shares * nav;
  }
  return roundAmount(mv);
}

function buildBenchmark(
  code: FundCode,
  tradingDates: string[],
  navMaps: Map<FundCode, Map<string, number>>,
  initialCash: number,
  purchaseFee: number,
  start: string,
  end: string,
): BenchmarkResult {
  const navMap = navMaps.get(code);
  const curve: DailySnapshot[] = [];
  // 首日全额买入持有
  const firstDateWithNav = tradingDates.find((d) => navMap?.get(d) !== undefined);
  const firstNav = firstDateWithNav ? navMap!.get(firstDateWithNav)! : undefined;
  const netAmount = firstNav ? initialCash / (1 + purchaseFee) : 0;
  const shares = firstNav ? netAmount / firstNav : 0;
  const cost = roundAmount(initialCash); // 基准首日一次性投入

  let prevMv = 0;
  let hIndex = 1;
  for (const date of tradingDates) {
    const nav = navMap?.get(date);
    const mv = nav !== undefined ? roundAmount(shares * nav) : prevMv;
    // 基准无后续资金流入，时间加权因子 = mv / prevMv（首日以成本为基）
    const base = prevMv > 1e-6 ? prevMv : cost;
    if (base > 1e-6 && mv > 0) hIndex = prevMv > 1e-6 ? hIndex * (mv / prevMv) : mv / base;
    prevMv = mv;
    curve.push({
      date,
      cash: 0,
      marketValue: mv,
      cost,
      investedCapital: cost,
      holdingIndex: roundRate(hIndex),
      totalAssets: mv,
    });
  }
  const final = curve.length > 0 ? curve[curve.length - 1].totalAssets : initialCash;
  return {
    fundCode: code,
    totalReturn: roundRate((final - initialCash) / initialCash),
    annualizedReturn: annualizedReturn(initialCash, final, start, end),
    maxDrawdown: maxDrawdown(curve),
    curve,
  };
}
