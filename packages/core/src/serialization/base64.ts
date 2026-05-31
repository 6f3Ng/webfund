import { deflate, inflate } from 'pako';

/** UTF-8 字符串 → Uint8Array */
function utf8Encode(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  // 退化实现（极少触发）
  const out: number[] = [];
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return new Uint8Array(out);
}

/** Uint8Array → UTF-8 字符串 */
function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let str = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    if (b < 0x80) str += String.fromCodePoint(b);
    else if (b < 0xe0) str += String.fromCodePoint(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b < 0xf0)
      str += String.fromCodePoint(
        ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f),
      );
    else
      str += String.fromCodePoint(
        ((b & 0x07) << 18) |
          ((bytes[i++] & 0x3f) << 12) |
          ((bytes[i++] & 0x3f) << 6) |
          (bytes[i++] & 0x3f),
      );
  }
  return str;
}

/** Uint8Array → base64（平台无关：优先 btoa，退化 Buffer） */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const g = globalThis as { btoa?: (s: string) => string };
  if (typeof g.btoa === 'function') return g.btoa(binary);
  // Node 退化
  return Buffer.from(bytes).toString('base64');
}

/** base64 → Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  const g = globalThis as { atob?: (s: string) => string };
  if (typeof g.atob === 'function') {
    const binary = g.atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** 对象 → JSON → (deflate 压缩) → base64 字符串 */
export function encodeBase64(obj: unknown, compress = true): string {
  const json = JSON.stringify(obj);
  const bytes = utf8Encode(json);
  const payload = compress ? deflate(bytes) : bytes;
  return bytesToBase64(payload);
}

/** base64 字符串 → (inflate) → JSON → 对象 */
export function decodeBase64<T>(b64: string, compressed = true): T {
  const payload = base64ToBytes(b64);
  const bytes = compressed ? inflate(payload) : payload;
  const json = utf8Decode(bytes);
  return JSON.parse(json) as T;
}
