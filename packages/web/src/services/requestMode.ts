/**
 * 多基金请求并发模式控制。
 *
 * 为规避第三方接口（天天基金等）在持仓基金较多时的 429 限流，
 * 默认对 `/api/history`、`/api/fund-info` 等按基金 fan-out 的请求顺序调用（一次一只）；
 * 也支持切换为并发调用（更快）。模式由 `settingsStore` 注册，避免基础服务直接依赖 store。
 */

let sequential = true;

/** 注册当前请求模式（settingsStore 初始化与更新时调用）。true=顺序，false=并发。 */
export function setSequentialRequests(value: boolean): void {
  sequential = value;
}

/** 当前是否顺序调用。 */
export function isSequentialRequests(): boolean {
  return sequential;
}

/**
 * 按当前模式映射执行：顺序模式下逐个 await（一次一只）；并发模式下 Promise.all。
 * 顺序模式保留输入顺序的返回数组，与并发模式语义一致。
 *
 * @param items 待处理项
 * @param fn    单项异步处理函数（接收项与下标）
 */
export async function mapRequests<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!sequential) {
    return Promise.all(items.map((item, i) => fn(item, i)));
  }
  const results: R[] = [];
  for (let i = 0; i < items.length; i++) {
    results.push(await fn(items[i], i));
  }
  return results;
}
