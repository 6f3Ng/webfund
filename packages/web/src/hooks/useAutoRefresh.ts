import { useEffect } from 'react';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useValuationStore, isTradingTime } from '@/stores/valuationStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * 交易时段自动刷新当前组合的估值。仅在设置开启且处于交易时段时轮询。
 */
export function useAutoRefresh(): void {
  const settings = useSettingsStore((s) => s.settings);
  const current = usePortfolioStore((s) => s.current);
  const refresh = useValuationStore((s) => s.refresh);

  useEffect(() => {
    if (!settings.autoRefresh) return;
    const tick = () => {
      if (!isTradingTime()) return;
      const pf = current();
      const codes = pf?.positions.map((p) => p.fundCode) ?? [];
      if (codes.length > 0) refresh(codes);
    };
    const id = window.setInterval(tick, settings.refreshIntervalSec * 1000);
    return () => window.clearInterval(id);
  }, [settings.autoRefresh, settings.refreshIntervalSec, current, refresh]);
}
