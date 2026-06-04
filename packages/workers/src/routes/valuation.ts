import { Hono } from 'hono';
import type { Env } from '../types';
import type { ValuationDTO, ValuationSourceId } from '../dto';
import { ok, fail, ErrorCodes } from '../lib/response';
import { cached, TTL } from '../lib/cache';
import { mapLimit } from '../lib/concurrency';
import { UpstreamError } from '../lib/fetch';
import { fetchEastmoneyValuation } from '../providers/eastmoney';
import { fetchDanjuanValuation } from '../providers/danjuan';

const app = new Hono<{ Bindings: Env }>();

/** 单源批量取估值的并发上限：限并发以规避第三方接口 429（快于纯串行，稳于全并发） */
const VALUATION_CONCURRENCY = 6;

type Fetcher = (code: string) => Promise<ValuationDTO>;
const FETCHERS: Record<Exclude<ValuationSourceId, 'self-calc'>, Fetcher> = {
  eastmoney: fetchEastmoneyValuation,
  danjuan: fetchDanjuanValuation,
};

/**
 * GET /api/valuation?codes=000001,000002&source=eastmoney
 * 批量估值。某源失败时对该基金尝试降级到另一可用源；单基金彻底失败带 error 返回，整体仍 200。
 * 限并发拉取，避免多基金时一次性并发触发第三方限流。
 */
app.get('/', async (c) => {
  const codesParam = c.req.query('codes');
  if (!codesParam) return fail(c, ErrorCodes.BAD_REQUEST, '缺少 codes 参数', 400);

  const codes = codesParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50); // 上限保护
  if (codes.length === 0) return fail(c, ErrorCodes.BAD_REQUEST, 'codes 为空', 400);

  const requested = (c.req.query('source') as ValuationSourceId) || 'eastmoney';
  const primary: Exclude<ValuationSourceId, 'self-calc'> =
    requested === 'danjuan' ? 'danjuan' : 'eastmoney';
  const fallback: Exclude<ValuationSourceId, 'self-calc'> =
    primary === 'eastmoney' ? 'danjuan' : 'eastmoney';

  const results = await mapLimit(codes, VALUATION_CONCURRENCY, async (code) => {
    try {
      return await cached(c.env, `val:${primary}:${code}`, TTL.valuation, () =>
        FETCHERS[primary](code),
      );
    } catch {
      // 降级到备用源
      try {
        return await cached(c.env, `val:${fallback}:${code}`, TTL.valuation, () =>
          FETCHERS[fallback](code),
        );
      } catch (e2) {
        return {
          fundCode: code,
          source: primary,
          estimatedNav: 0,
          estimatedGrowthPct: 0,
          estimatedAt: '',
          error: e2 instanceof UpstreamError ? e2.message : '估值获取失败',
        } as ValuationDTO;
      }
    }
  });

  return ok(c, results);
});

export default app;
