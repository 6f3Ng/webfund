import type { Context } from 'hono';

/** 标准成功响应 { ok: true, data } */
export function ok<T>(c: Context, data: T, init?: ResponseInit) {
  return c.json({ ok: true, data }, init as never);
}

/** 标准错误响应 { ok: false, error } */
export function fail(
  c: Context,
  code: string,
  message: string,
  status: 400 | 404 | 429 | 500 | 502 = 500,
) {
  return c.json({ ok: false, error: { code, message } }, status);
}

/** 已知错误码 */
export const ErrorCodes = {
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  INTERNAL: 'INTERNAL',
} as const;
