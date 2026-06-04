import { Hono } from 'hono';
import type { Env } from '../types';
import type { ValuationDTO, QuoteDTO, FundHoldingsDTO } from '../dto';
import { ok, fail, ErrorCodes } from '../lib/response';
import { cached, TTL } from '../lib/cache';
import { mapLimit } from '../lib/concurrency';
import { fetchFundHoldings } from '../providers/holdings';
import { fetchQuotes } from '../providers/quote';
import { fetchEastmoneyValuation } from '../providers/eastmoney';
import { computeSelfValuation, CSI300_SYMBOL } from '../valuation/self-calc';

const app = new Hono<{ Bindings: Env }>();

/** 单基金上游并发上限：限并发以规避第三方接口 429（快于纯串行，稳于全并发） */
const SELF_NAV_CONCURRENCY = 4;

/**
 * GET /api/self-nav?codes=110011,000001
 * 自建估值：基于公开持仓 + 个股实时行情加权，沪深300 补全未覆盖仓位。
 * 内部聚合 holdings + quote + base nav，批量合并个股行情请求。
 *
 * 健壮性：单只基金的持仓 / 基准净值 / 行情获取失败均被隔离，不影响其他基金；
 * 整体始终返回 200，失败的基金在结果中带 error 字段（前端据此降级/提示）。
 */
app.get('/', async (c) => {
  const codesParam = c.req.query('codes');
  if (!codesParam) return fail(c, ErrorCodes.BAD_REQUEST, '缺少 codes 参数', 400);
  const codes = codesParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (codes.length === 0) return fail(c, ErrorCodes.BAD_REQUEST, 'codes 为空', 400);

  // 1. 限并发取各基金持仓（天级缓存）与基准净值（估值缓存）；单只失败不影响整体。
  const perFund = await mapLimit(codes, SELF_NAV_CONCURRENCY, async (code) => {
    const [holdings, baseVal] = await Promise.all([
      cached(c.env, `holdings:${code}:10`, TTL.holdings, () => fetchFundHoldings(code, 10)).catch(
        () => undefined,
      ),
      cached(c.env, `val:eastmoney:${code}`, TTL.valuation, () =>
        fetchEastmoneyValuation(code),
      ).catch(() => undefined),
    ]);
    return { code, holdings, baseVal };
  });

  // 2. 汇总所有需要的个股 symbol + 沪深300，去重，批量取行情（单点失败时降级为空行情）。
  const symbolSet = new Set<string>([CSI300_SYMBOL]);
  for (const f of perFund) {
    for (const item of f.holdings?.holdings ?? []) symbolSet.add(item.symbol);
  }
  const symbols = [...symbolSet];
  const quoteKey = `quote:${symbols.slice().sort().join(',')}`;
  const quotes = await cached(c.env, quoteKey, TTL.quote, () => fetchQuotes(symbols)).catch(
    () => [] as QuoteDTO[],
  );
  const quoteMap = new Map<string, QuoteDTO>(quotes.map((q) => [q.symbol, q]));

  // 3. 逐基金计算自建估值；缺持仓/缺基准的基金给出带 error 的降级结果。
  const results: ValuationDTO[] = perFund.map(({ code, holdings, baseVal }) => {
    if (!holdings) {
      return failedValuation(code, '公开持仓获取失败');
    }
    const result = computeSelfValuation({
      fundCode: code,
      holdings: holdings as FundHoldingsDTO,
      quotes: quoteMap,
      baseNav: baseVal?.baseNav,
      baseNavDate: baseVal?.baseNavDate,
    });
    // 既无基准净值又无任何行情覆盖时，估值不可信，标注 error 供前端降级。
    if (!baseVal?.baseNav && (result.confidence ?? 0) === 0 && quoteMap.size <= 1) {
      result.error = '基准净值与个股行情均不可用';
    }
    return result;
  });

  return ok(c, results);
});

/** 构造单基金降级估值结果（整体 200，前端按 error 降级到其他源/提示） */
function failedValuation(code: string, message: string): ValuationDTO {
  return {
    fundCode: code,
    source: 'self-calc',
    estimatedNav: 0,
    estimatedGrowthPct: 0,
    estimatedAt: new Date().toISOString(),
    confidence: 0,
    error: message,
  };
}

export default app;
