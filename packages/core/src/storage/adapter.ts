/**
 * 平台无关的存储适配器接口。
 * - Web 实现：LocalStorageAdapter（packages/web）
 * - 小程序实现（演进期）：WxStorageAdapter（wx.getStorageSync 等）
 *
 * 接口仅处理字符串读写，对象的序列化由上层 Repository 负责，
 * 以便统一 JSON 处理与错误边界。
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** 返回所有 key（用于按前缀枚举） */
  keys(): string[];
}

/** 内存实现：用于测试与 SSR 场景。 */
export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  keys(): string[] {
    return [...this.store.keys()];
  }
}
