import { Hono } from 'hono';
import type { Env } from '../types';
import { ok, fail, ErrorCodes } from '../lib/response';
import { cached, TTL } from '../lib/cache';
import { UpstreamError } from '../lib/fetch';
import { fetchEastmoneyFundInfo } from '../providers/eastmoney';

const app = new Hono<{ Bindings: Env }>();

/** GET /api/fund-info?code=000001 */
app.get('/', async (c) => {
  const code = c.req.query('code');
  if (!code) return fail(c, ErrorCodes.BAD_REQUEST, '缺少 code 参数', 400);
  try {
    const info = await cached(c.env, `info:${code}`, TTL.fundInfo, () =>
      fetchEastmoneyFundInfo(code),
    );
    return ok(c, info);
  } catch (e) {
    const msg = e instanceof UpstreamError ? e.message : '基金信息获取失败';
    return fail(c, ErrorCodes.UPSTREAM_ERROR, msg, 502);
  }
});

export default app;
