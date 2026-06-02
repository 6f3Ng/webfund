/**
 * Pages Functions 代理：将 /api/* 请求转发到 Cloudflare Workers 后端。
 *
 * 背景：*.workers.dev 域名在大陆被墙，*.pages.dev 可访问。
 * 通过此代理，前端只需访问 Pages 域名，/api/* 由本函数转发到 Workers。
 *
 * 配置方式（二选一）：
 *   1. 在 Pages 项目 Settings → Environment variables 中添加 WORKER_API_HOST
 *      值为你的 Workers 域名（不含 https://），如 fund-workers.xxx.workers.dev
 *   2. 直接修改下方 DEFAULT_WORKER_HOST 常量
 */
const DEFAULT_WORKER_HOST = 'fund-workers.YOUR_SUBDOMAIN.workers.dev';

export async function onRequest(context) {
  const { request, env } = context;

  const workerHost = env.WORKER_API_HOST || DEFAULT_WORKER_HOST;

  if (!workerHost || workerHost.includes('YOUR_SUBDOMAIN')) {
    return new Response(
      JSON.stringify({ ok: false, error: 'WORKER_API_HOST 未配置，请在 Pages 环境变量中设置' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const originalUrl = new URL(request.url);
  const targetUrl = `https://${workerHost}${originalUrl.pathname}${originalUrl.search}`;

  const headers = new Headers(request.headers);
  headers.set('Host', workerHost);

  const proxiedRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
  });

  try {
    return await fetch(proxiedRequest);
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: `代理请求失败: ${err.message}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
