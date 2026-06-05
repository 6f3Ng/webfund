import { API_BASE } from '@/config';

export interface ApiError {
  code: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** 可重试的瞬时状态：限流 429 / 上游 5xx / 网关 502-504。非这些则立即抛出。 */
function isRetryableCode(code: string, httpStatus: number): boolean {
  if (httpStatus === 429 || (httpStatus >= 500 && httpStatus <= 504)) return true;
  // 后端标准错误码：限流 / 上游错误
  return code === 'RATE_LIMITED' || code === 'UPSTREAM_ERROR' || code.startsWith('HTTP_5');
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 通用 GET 请求，返回标准化 { ok, data | error } 结构中的 data。
 *  对瞬时错误（限流 429 / 上游 5xx）做指数退避 + 抖动重试，
 *  避免多基金 fan-out 时偶发限流导致单只基金静默失败。 */
export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number>,
  options: { retries?: number; retryBaseMs?: number } = {},
): Promise<T> {
  const { retries = 3, retryBaseMs = 400 } = options;
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }

  let lastErr: ApiRequestError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url.toString(), { method: 'GET' });
    let body: { ok: boolean; data?: T; error?: ApiError };
    try {
      body = (await res.json()) as { ok: boolean; data?: T; error?: ApiError };
    } catch {
      body = { ok: false, error: { code: 'HTTP_' + res.status, message: res.statusText } };
    }

    if (res.ok && body.ok) return body.data as T;

    const err = body.error ?? { code: 'HTTP_' + res.status, message: res.statusText };
    lastErr = new ApiRequestError(err.code, err.message);
    // 仅对瞬时错误重试；其余立即抛出
    if (attempt >= retries || !isRetryableCode(err.code, res.status)) throw lastErr;
    const backoff = retryBaseMs * 2 ** attempt + Math.floor(Math.random() * retryBaseMs);
    await sleep(backoff);
  }
  throw lastErr ?? new ApiRequestError('UNKNOWN', '请求失败');
}

/** 健康检查（ping 返回扁平结构，不走标准 data 信封） */
export async function ping(): Promise<{ ok: boolean; service: string; time: string }> {
  const res = await fetch(`${API_BASE}/ping`);
  return (await res.json()) as { ok: boolean; service: string; time: string };
}
