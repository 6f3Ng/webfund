import type { StorageAdapter } from './adapter';

/** localStorage 典型上限约 5MB（按 UTF-16 字符计，约 5,000,000） */
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;
/** 接近上限的预警阈值（80%） */
export const STORAGE_WARN_RATIO = 0.8;

/** UTF-8 字节长度估算 */
export function byteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++; // 代理对，跳过低位
    } else bytes += 3;
  }
  return bytes;
}

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  ratio: number;
  nearLimit: boolean;
}

/** 估算当前 fund.* 命名空间下的存储占用 */
export function estimateUsage(adapter: StorageAdapter, prefix = 'fund.'): StorageUsage {
  let used = 0;
  for (const key of adapter.keys()) {
    if (!key.startsWith(prefix)) continue;
    const v = adapter.getItem(key);
    if (v != null) used += byteLength(key) + byteLength(v);
  }
  const ratio = used / STORAGE_LIMIT_BYTES;
  return {
    usedBytes: used,
    limitBytes: STORAGE_LIMIT_BYTES,
    ratio,
    nearLimit: ratio >= STORAGE_WARN_RATIO,
  };
}

/** 在写入前预估：写入 newValue 后是否会超过上限 */
export function willExceedLimit(
  adapter: StorageAdapter,
  key: string,
  newValue: string,
  prefix = 'fund.',
): boolean {
  const current = estimateUsage(adapter, prefix).usedBytes;
  const existing = adapter.getItem(key);
  const existingSize = existing != null ? byteLength(key) + byteLength(existing) : 0;
  const projected = current - existingSize + byteLength(key) + byteLength(newValue);
  return projected > STORAGE_LIMIT_BYTES;
}
