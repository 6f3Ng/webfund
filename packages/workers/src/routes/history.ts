import { Hono } from 'hono';
import type { Env } from '../types';
import { ok, fail, ErrorCodes } from '../lib/response';
import { cached, TTL } from '../lib/cache';
import { UpstreamError } from '../lib/fetch';
import { fetchEastmoneyHistory } from '../providers/eastmoney';
import { fetchDanjuanHistory } from '../providers/danjuan';

const app = new Hono<{ Bindings: Env }>();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/history?code=000001&start=2023-01-01&end=2023-12-31&source=eastmoney
 * 历史净值（升序）。
 */
app.get('/', async (c) => {
  const code = c.req.query('code');
  const start = c.req.query('start');
  const end = c.req.query('end');
  const source = c.req.query('source') || 'eastmoney';

  if (!code) return fail(c, ErrorCodes.BAD_REQUEST, '缺少 code 参数', 400);
  if (!start || !DATE_RE.test(start)) return fail(c, ErrorCodes.BAD_REQUEST, 'start 格式应为 YYYY-MM-DD', 400);
  if (!end || !DATE_RE.test(end)) return fail(c, ErrorCodes.BAD_REQUEST, 'end 格式应为 YYYY-MM-DD', 400);

  const key = `hist:${source}:${code}:${start}:${end}`;
  try {
    const data = await cached(c.env, key, TTL.history, () =>
      source === 'danjuan'
        ? fetchDanjuanHistory(code).then((all) =>
            all.filter((p) => p.date >= start && p.date <= end),
          )
        : fetchEastmoneyHistory(code, start, end),
    );
    return ok(c, { code, start, end, source, points: data });
  } catch (e) {
    const msg = e instanceof UpstreamError ? e.message : '历史净值获取失败';
    return fail(c, ErrorCodes.UPSTREAM_ERROR, msg, 502);
  }
});

export default app;
