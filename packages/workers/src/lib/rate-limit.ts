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

/**
 * 默认限流参数。
 *
 * 取值偏宽松的原因：本服务是个人工具（CORS 白名单限定来源），对第三方上游的真正保护
 * 来自缓存层（估值 45s、历史 6h、持仓/基金信息 24h）——一旦命中缓存便不再触达上游。
 * 而前端在多基金持仓场景下会按基金 fan-out 调用 `/api/history`、`/api/fund-info`
 * （如 20+ 只基金 × 多次刷新/结算叠加），过紧的桶会把这些**合法**请求误判为限流并返回 429，
 * 导致"概率性多个基金取不到估值"。因此放宽到可从容支撑约 50 只基金、数轮叠加请求，
 * 同时仍能拦截明显异常的高频突发。
 */
const DEFAULT_OPTIONS: RateLimitOptions = { capacity: 120, refillPerSec: 60 };

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
