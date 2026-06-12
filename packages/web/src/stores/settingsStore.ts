import { create } from 'zustand';
import { SettingsRepository, type AppSettings, type ValuationSourceId } from '@fund/core';
import { storageAdapter } from '@/adapters/LocalStorageAdapter';
import { setPurchaseFeeRates, setRedeemFeeRates } from '@/services/fundInfoService';
import { setSequentialRequests } from '@/services/requestMode';

const repo = new SettingsRepository(storageAdapter);

/** 将 A/C 类申购费率同步到 fundInfoService，使交易结算按份额类别取费率。 */
function syncPurchaseFeeRates(s: AppSettings): void {
  setPurchaseFeeRates({ a: s.defaultPurchaseFeeRate, c: s.defaultPurchaseFeeRateC });
}

/** 将 A/C 类赎回费率同步到 fundInfoService，使交易结算按份额类别取费率。 */
function syncRedeemFeeRates(s: AppSettings): void {
  setRedeemFeeRates({ a: s.defaultRedeemFeeRate, c: s.defaultRedeemFeeRateC });
}

/** 将派生设置同步到对应服务（申购/赎回费率、请求并发模式）。 */
function syncDerived(s: AppSettings): void {
  syncPurchaseFeeRates(s);
  syncRedeemFeeRates(s);
  setSequentialRequests(s.sequentialRequests);
}

interface SettingsState {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  setSource: (source: ValuationSourceId) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const initial = repo.get();
  syncDerived(initial);
  return {
    settings: initial,
    update: (patch) => {
      const next = { ...get().settings, ...patch };
      repo.save(next);
      syncDerived(next);
      set({ settings: next });
    },
    setSource: (source) => get().update({ defaultValuationSource: source }),
  };
});
