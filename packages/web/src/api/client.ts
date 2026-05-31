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

/** 通用 GET 请求，返回标准化 { ok, data | error } 结构中的 data */
export async function apiGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), { method: 'GET' });
  const body = (await res.json()) as { ok: boolean; data?: T; error?: ApiError };

  if (!res.ok || !body.ok) {
    const err = body.error ?? { code: 'HTTP_' + res.status, message: res.statusText };
    throw new ApiRequestError(err.code, err.message);
  }
  return body.data as T;
}

/** 健康检查（ping 返回扁平结构，不走标准 data 信封） */
export async function ping(): Promise<{ ok: boolean; service: string; time: string }> {
  const res = await fetch(`${API_BASE}/ping`);
  return (await res.json()) as { ok: boolean; service: string; time: string };
}
