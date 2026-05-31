/**
 * 生成唯一 id。优先使用 crypto.randomUUID（浏览器/Node/小程序新环境均支持），
 * 退化为时间戳 + 随机数，保证平台无关。
 */
export function generateId(prefix = ''): string {
  let core: string;
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') {
    core = g.crypto.randomUUID();
  } else {
    core = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return prefix ? `${prefix}_${core}` : core;
}
