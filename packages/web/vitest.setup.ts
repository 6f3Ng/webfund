/**
 * 测试环境 localStorage 兜底。
 *
 * 背景：Node 较新版本（>=22 起的实验特性，Node 25 默认开启）会注入一个原生的
 * Web Storage `localStorage` 全局；在 jsdom 环境下（window === globalThis）该原生对象
 * 会遮蔽 jsdom 的实现，且在未提供 `--localstorage-file` 时其 `setItem` 等方法不可用。
 * 这会导致经 `LocalStorageAdapter`（调用 `window.localStorage`）的 `portfolioStore` 测试失败。
 *
 * 这里统一安装一个干净的内存版 Storage，保证 `localStorage`/`window.localStorage` 可用，
 * 且可在每个用例间通过 `localStorage.clear()` 清空状态。
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }
}

function installLocalStorage(): void {
  const current = (globalThis as { localStorage?: unknown }).localStorage as
    | { setItem?: unknown }
    | undefined;
  // 仅当不存在或不可用（无 setItem 方法）时安装内存实现。
  if (current && typeof current.setItem === 'function') return;
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

installLocalStorage();

// 每个用例前清空，确保 store 状态在用例间互不影响。
beforeEach(() => {
  globalThis.localStorage.clear();
});
