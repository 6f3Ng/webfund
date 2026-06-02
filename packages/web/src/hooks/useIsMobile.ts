import { useEffect, useState } from 'react';

/** 移动端断点（与 AntD xs/sm 边界一致：<768px 视为移动端） */
export const MOBILE_BREAKPOINT = 768;

/**
 * 响应式判断当前视口是否为移动端宽度（<768px）。
 * 基于 matchMedia 订阅变化，SSR/无 window 时默认 false。
 */
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const query = `(max-width: ${breakpoint - 0.02}px)`;
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    // Safari <14 仅支持 addListener
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return isMobile;
}
