import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { fail, ErrorCodes } from './lib/response';
import { allowRequest, clientKey } from './lib/rate-limit';
import valuationRoutes from './routes/valuation';
import historyRoutes from './routes/history';
import fundInfoRoutes from './routes/fund-info';
import calendarRoutes from './routes/calendar';
import holdingsRoutes from './routes/holdings';
import quoteRoutes from './routes/quote';
import selfNavRoutes from './routes/self-nav';

const app = new Hono<{ Bindings: Env }>();

// CORS：基于环境变量的白名单
app.use('/api/*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
  const handler = cors({
    origin: (origin) => (allowed.includes(origin) ? origin : (allowed[0] ?? '')),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  });
  return handler(c, next);
});

// 限流（按 IP + 路径）
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (!allowRequest(clientKey(c.req.raw, path))) {
    return fail(c, ErrorCodes.RATE_LIMITED, '请求过于频繁，请稍后再试', 429);
  }
  return next();
});

// 健康检查
app.get('/api/ping', (c) =>
  c.json({ ok: true, service: 'fund-workers', time: new Date().toISOString() }),
);

// 业务路由
app.route('/api/valuation', valuationRoutes);
app.route('/api/history', historyRoutes);
app.route('/api/fund-info', fundInfoRoutes);
app.route('/api/calendar', calendarRoutes);
app.route('/api/holdings', holdingsRoutes);
app.route('/api/quote', quoteRoutes);
app.route('/api/self-nav', selfNavRoutes);

// 兜底
app.onError((err, c) => {
  console.error('[workers error]', err);
  return fail(c, ErrorCodes.INTERNAL, err.message, 500);
});
app.notFound((c) => fail(c, ErrorCodes.NOT_FOUND, 'Not Found', 404));

export default app;
