import type { StorageAdapter } from '@fund/core';

/**
 * 浏览器 localStorage 适配器实现。
 * 仅枚举/操作 fund.* 命名空间下的键，避免干扰其他应用数据。
 */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly prefix = 'fund.') {}

  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    window.localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    window.localStorage.removeItem(key);
  }

  keys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(this.prefix)) out.push(k);
    }
    return out;
  }
}

/** 单例适配器，供 store 使用 */
export const storageAdapter = new LocalStorageAdapter();
