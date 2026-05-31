import { Hono } from 'hono';
import type { Env } from '../types';
import { ok, fail, ErrorCodes } from '../lib/response';
import { cached, TTL } from '../lib/cache';
import { UpstreamError } from '../lib/fetch';
import { fetchFundHoldings } from '../providers/holdings';

const app = new Hono<{ Bindings: Env }>();

/** GET /api/holdings?code=110011&top=10 */
app.get('/', async (c) => {
  const code = c.req.query('code');
  if (!code) return fail(c, ErrorCodes.BAD_REQUEST, '缺少 code 参数', 400);
  const top = Math.min(Number(c.req.query('top')) || 10, 50);
  try {
    const data = await cached(c.env, `holdings:${code}:${top}`, TTL.holdings, () =>
      fetchFundHoldings(code, top),
    );
    return ok(c, data);
  } catch (e) {
    const msg = e instanceof UpstreamError ? e.message : '持仓获取失败';
    return fail(c, ErrorCodes.UPSTREAM_ERROR, msg, 502);
  }
});

export default app;
