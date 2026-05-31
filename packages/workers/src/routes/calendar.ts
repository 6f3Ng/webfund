import { Hono } from 'hono';
import type { Env } from '../types';
import { ok } from '../lib/response';
import { getCalendarData } from '../providers/calendar';

const app = new Hono<{ Bindings: Env }>();

/** GET /api/calendar?year=2024  (year 可选，省略返回全部) */
app.get('/', (c) => {
  const yearParam = c.req.query('year');
  const year = yearParam ? Number(yearParam) : undefined;
  return ok(c, getCalendarData(year && Number.isFinite(year) ? year : undefined));
});

export default app;
