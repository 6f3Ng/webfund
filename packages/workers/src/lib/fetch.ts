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
  /** 失败重试次数（针对超时 / 429 / 5xx 等瞬时错误），默认 2（即最多请求 3 次） */
  retries?: number;
  /** 重试基础退避毫秒，默认 300ms（指数退避 + 抖动） */
  retryBaseMs?: number;
}

/** 拟真浏览器默认头：降低被第三方接口按"非浏览器/爬虫"拦截（403/412）的概率。 */
const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/javascript, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/** 判断错误是否值得重试（瞬时错误：超时 504 / 限流 429 / 5xx / 网络层失败 502）。 */
function isTransient(status: number): boolean {
  return status === 429 || status === 408 || status === 425 || status >= 500;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 单次带超时的上游请求（不含重试） */
async function fetchOnce(url: string, headers: Record<string, string>, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { ...DEFAULT_HEADERS, ...headers },
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

/** 带超时与瞬时错误重试的上游请求，返回文本 */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const { headers = {}, timeoutMs = 8000, retries = 2, retryBaseMs = 300 } = options;
  let lastErr: UpstreamError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchOnce(url, headers, timeoutMs);
    } catch (e) {
      const err = e instanceof UpstreamError ? e : new UpstreamError(502, String(e));
      lastErr = err;
      // 仅对瞬时错误重试；非瞬时（如 400/404）立即抛出
      if (attempt >= retries || !isTransient(err.status)) throw err;
      // 指数退避 + 抖动，缓解第三方限流
      const backoff = retryBaseMs * 2 ** attempt + Math.floor(Math.random() * retryBaseMs);
      await sleep(backoff);
    }
  }
  throw lastErr ?? new UpstreamError(502, '上游请求失败');
}

/** 带超时与重试的上游请求，返回 JSON */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(502, `上游返回非 JSON: ${text.slice(0, 100)}`);
  }
}
