import { Hono } from 'hono';
import type { Env } from '../types';
import { ok, fail, ErrorCodes } from '../lib/response';
import { cached, TTL } from '../lib/cache';
import { UpstreamError } from '../lib/fetch';
import { fetchQuotes } from '../providers/quote';

const app = new Hono<{ Bindings: Env }>();

/** GET /api/quote?symbols=sh600519,sz000858 */
app.get('/', async (c) => {
  const symbolsParam = c.req.query('symbols');
  if (!symbolsParam) return fail(c, ErrorCodes.BAD_REQUEST, '缺少 symbols 参数', 400);
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2}\d{6}$/.test(s))
    .slice(0, 100);
  if (symbols.length === 0) return fail(c, ErrorCodes.BAD_REQUEST, 'symbols 无有效项', 400);

  try {
    // 行情缓存粒度到 symbol 集合（短 TTL）
    const key = `quote:${symbols.slice().sort().join(',')}`;
    const data = await cached(c.env, key, TTL.quote, () => fetchQuotes(symbols));
    return ok(c, data);
  } catch (e) {
    const msg = e instanceof UpstreamError ? e.message : '行情获取失败';
    return fail(c, ErrorCodes.UPSTREAM_ERROR, msg, 502);
  }
});

export default app;
