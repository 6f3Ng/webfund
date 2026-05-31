import { Hono } from 'hono';
import type { Env } from '../types';
import type { ValuationDTO, QuoteDTO } from '../dto';
import { ok, fail, ErrorCodes } from '../lib/response';
import { cached, TTL } from '../lib/cache';
import { UpstreamError } from '../lib/fetch';
import { fetchFundHoldings } from '../providers/holdings';
import { fetchQuotes } from '../providers/quote';
import { fetchEastmoneyValuation } from '../providers/eastmoney';
import { computeSelfValuation, CSI300_SYMBOL } from '../valuation/self-calc';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/self-nav?codes=110011,000001
 * 自建估值：基于公开持仓 + 个股实时行情加权，沪深300 补全未覆盖仓位。
 * 内部聚合 holdings + quote + base nav，批量合并个股行情请求。
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

  try {
    // 1. 并行取各基金持仓（天级缓存）与基准净值（估值缓存）
    const holdingsList = await Promise.all(
      codes.map((code) =>
        cached(c.env, `holdings:${code}:10`, TTL.holdings, () => fetchFundHoldings(code, 10)),
      ),
    );
    const baseValuations = await Promise.all(
      codes.map((code) =>
        cached(c.env, `val:eastmoney:${code}`, TTL.valuation, () =>
          fetchEastmoneyValuation(code),
        ).catch(() => undefined),
      ),
    );

    // 2. 汇总所有需要的个股 symbol + 沪深300，去重，批量取行情
    const symbolSet = new Set<string>([CSI300_SYMBOL]);
    for (const h of holdingsList) {
      for (const item of h.holdings) symbolSet.add(item.symbol);
    }
    const symbols = [...symbolSet];
    const quoteKey = `quote:${symbols.slice().sort().join(',')}`;
    const quotes = await cached(c.env, quoteKey, TTL.quote, () => fetchQuotes(symbols));
    const quoteMap = new Map<string, QuoteDTO>(quotes.map((q) => [q.symbol, q]));

    // 3. 逐基金计算自建估值
    const results: ValuationDTO[] = codes.map((code, i) => {
      const baseVal = baseValuations[i];
      return computeSelfValuation({
        fundCode: code,
        holdings: holdingsList[i],
        quotes: quoteMap,
        baseNav: baseVal?.baseNav,
        baseNavDate: baseVal?.baseNavDate,
      });
    });

    return ok(c, results);
  } catch (e) {
    const msg = e instanceof UpstreamError ? e.message : '自建估值计算失败';
    return fail(c, ErrorCodes.UPSTREAM_ERROR, msg, 502);
  }
});

export default app;
