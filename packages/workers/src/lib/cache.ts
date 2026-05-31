import type { Env } from '../types';

/**
 * 边缘缓存封装。优先使用 KV（若绑定），否则退化为进程内 Map（单实例有效）。
 * 设计为按"逻辑键 + TTL"缓存 JSON 数据。
 */
const memoryCache = new Map<string, { value: unknown; expireAt: number }>();

function memGet<T>(key: string): T | undefined {
  const hit = memoryCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expireAt) {
    memoryCache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function memSet(key: string, value: unknown, ttlSec: number): void {
  memoryCache.set(key, { value, expireAt: Date.now() + ttlSec * 1000 });
  // 简单容量控制
  if (memoryCache.size > 1000) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
}

export async function cacheGet<T>(env: Env, key: string): Promise<T | undefined> {
  const mem = memGet<T>(key);
  if (mem !== undefined) return mem;

  if (env.FUND_CACHE) {
    const raw = await env.FUND_CACHE.get(key);
    if (raw != null) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export async function cacheSet(
  env: Env,
  key: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  memSet(key, value, ttlSec);
  if (env.FUND_CACHE) {
    // KV 最小 TTL 为 60s
    const expirationTtl = Math.max(60, ttlSec);
    await env.FUND_CACHE.put(key, JSON.stringify(value), { expirationTtl });
  }
}

/** 缓存读取-否则计算-回填 的便捷封装 */
export async function cached<T>(
  env: Env,
  key: string,
  ttlSec: number,
  producer: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(env, key);
  if (hit !== undefined) return hit;
  const value = await producer();
  await cacheSet(env, key, value, ttlSec);
  return value;
}

/** TTL 预设（秒） */
export const TTL = {
  valuation: 45, // 估值（交易时段）
  history: 6 * 3600, // 历史净值
  holdings: 24 * 3600, // 公开持仓（天级）
  quote: 10, // 个股行情
  fundInfo: 24 * 3600, // 基金信息
  calendar: 7 * 24 * 3600, // 交易日历
} as const;
