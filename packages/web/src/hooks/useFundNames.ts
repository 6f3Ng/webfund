import { useEffect, useMemo, useState } from 'react';
import { prefetchFundInfo, getCachedFundName } from '@/services/fundInfoService';
import { mapRequests } from '@/services/requestMode';
import { resolveDisplayName } from '@/utils/holdings';

/**
 * 基金名称解析 Hook（需求 4：策略 / 回测等仅展示基金代码处增加「名称 + 代码」双展示）。
 *
 * - 入参 codes：需要解析名称的 6 位基金代码集合（去重后预取）。
 * - 对未缓存的代码按当前请求模式（顺序 / 并发）调用 `prefetchFundInfo` 预取名称，
 *   回填本地 names 状态触发重渲染；名称属展示层关注点，不进领域 store。
 * - 返回 `resolve(code)`：名称（本地表 → 缓存 → 回退 6 位代码）。
 *
 * 与持仓页（HomePage）的名称解析口径一致（resolveDisplayName + getCachedFundName）。
 */
export function useFundNames(codes: string[]): {
  names: Record<string, string>;
  resolve: (code: string) => string;
} {
  const [names, setNames] = useState<Record<string, string>>({});

  // 去重并稳定 key，避免数组引用变化导致的重复预取
  const key = useMemo(() => [...new Set(codes)].sort().join(','), [codes]);

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (list.length === 0) return;
    let alive = true;
    void mapRequests(list, async (code) => {
      try {
        await prefetchFundInfo(code);
      } catch {
        // 忽略：解析失败时回退展示代码
      }
    }).then(() => {
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const code of list) {
        const nm = getCachedFundName(code);
        if (nm) next[code] = nm;
      }
      setNames((prev) => ({ ...prev, ...next }));
    });
    return () => {
      alive = false;
    };
  }, [key]);

  const resolve = (code: string) => resolveDisplayName(code, names, getCachedFundName);
  return { names, resolve };
}

/**
 * 在转换流水/订单里渲染「源→目标」时复用：返回两段名称代码。
 */
export function resolveConvertLabel(
  resolve: (code: string) => string,
  fundCode: string,
  targetFundCode?: string,
): string {
  if (targetFundCode) return `${resolve(fundCode)} → ${resolve(targetFundCode)}`;
  return resolve(fundCode);
}
