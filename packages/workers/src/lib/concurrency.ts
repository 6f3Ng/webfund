/**
 * 受限并发映射：以最多 `limit` 个并发执行 `fn`，保留输入顺序返回结果。
 * 用于在 Workers 内对多只基金的上游请求做"限并发"，既快于纯串行，
 * 又避免一次性并发过多触发第三方接口 429 限流（自建估值场景尤甚）。
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const size = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const current = next++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}
