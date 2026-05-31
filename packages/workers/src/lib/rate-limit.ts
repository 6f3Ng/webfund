/**
 * 简易令牌桶限流（进程内，单实例有效）。用于保护上游第三方接口与自身额度。
 * 生产环境可替换为 Durable Object / KV 计数实现跨实例限流。
 */
interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** 容量（突发上限） */
  capacity: number;
  /** 每秒补充令牌数 */
  refillPerSec: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = { capacity: 30, refillPerSec: 10 };

/** 返回 true 表示放行，false 表示被限流 */
export function allowRequest(key: string, options: RateLimitOptions = DEFAULT_OPTIONS): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: options.capacity, lastRefill: now };
    buckets.set(key, bucket);
  }
  // 补充令牌
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(options.capacity, bucket.tokens + elapsedSec * options.refillPerSec);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

/** 提取限流键（按 IP + 路径） */
export function clientKey(request: Request, path: string): string {
  const ip =
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For') ??
    'unknown';
  return `${ip}:${path}`;
}
