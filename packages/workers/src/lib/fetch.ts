/** 上游请求错误 */
export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** 带超时的上游请求，返回文本 */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const { headers = {}, timeoutMs = 8000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; fund-workers/1.0)', ...headers },
      signal: controller.signal,
      cf: { cacheTtl: 0 } as RequestInit['cf'],
    });
    if (!res.ok) {
      throw new UpstreamError(res.status, `上游返回 ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    if ((e as Error).name === 'AbortError') {
      throw new UpstreamError(504, `上游请求超时 (${timeoutMs}ms): ${url}`);
    }
    throw new UpstreamError(502, `上游请求失败: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 带超时的上游请求，返回 JSON */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(502, `上游返回非 JSON: ${text.slice(0, 100)}`);
  }
}
