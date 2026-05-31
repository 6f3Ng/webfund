import { create } from 'zustand';
import { SettingsRepository, type AppSettings, type ValuationSourceId } from '@fund/core';
import { storageAdapter } from '@/adapters/LocalStorageAdapter';

const repo = new SettingsRepository(storageAdapter);

interface SettingsState {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  setSource: (source: ValuationSourceId) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: repo.get(),
  update: (patch) => {
    const next = { ...get().settings, ...patch };
    repo.save(next);
    set({ settings: next });
  },
  setSource: (source) => get().update({ defaultValuationSource: source }),
}));
