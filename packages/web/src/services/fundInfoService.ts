import { createDefaultFundInfo, type FundInfo, type FundInfoProvider } from '@fund/core';
import { fetchFundInfo } from '@/api/funds';

/** 基金信息缓存（名称等）；费率使用默认配置（费率接口不稳定，采用统一默认）。 */
const cache = new Map<string, FundInfo>();

/** 异步预取并缓存基金信息（仅补充名称） */
export async function prefetchFundInfo(code: string): Promise<FundInfo> {
  if (cache.has(code)) return cache.get(code)!;
  const info = createDefaultFundInfo(code);
  try {
    const remote = await fetchFundInfo(code);
    info.name = remote.name || code;
  } catch {
    // 忽略，使用默认
  }
  cache.set(code, info);
  return info;
}

/** 同步 FundInfoProvider（供交易引擎使用），未缓存时返回默认配置 */
export const fundInfoProvider: FundInfoProvider = (code) => {
  return cache.get(code) ?? createDefaultFundInfo(code);
};

/** 取已缓存的基金名称 */
export function getCachedFundName(code: string): string | undefined {
  return cache.get(code)?.name;
}
