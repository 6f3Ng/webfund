import type { QuoteDTO } from '../dto';
import { UpstreamError } from '../lib/fetch';

/**
 * 腾讯股票行情。返回形如：
 *   v_sh600519="1~贵州茅台~600519~current~prevClose~...";
 * 字段（~ 分隔）：[1]名称 [2]代码 [3]现价 [4]昨收 [5]今开 ...
 * 数据来自公开网络，仅供参考。
 */

/** GBK 解码器（若运行时不支持则回退）。个股名称可能乱码，但价格字段为 ASCII 不受影响。 */
function decodeBody(buf: ArrayBuffer): string {
  for (const enc of ['gbk', 'gb18030']) {
    try {
      return new TextDecoder(enc).decode(buf);
    } catch {
      // 运行时不支持该编码，尝试下一个
    }
  }
  // 回退：latin1 保留字节值，数字与 ~ 分隔符可正确解析（中文名乱码不影响估值计算）
  return new TextDecoder('latin1').decode(buf);
}

export function parseTencentQuotes(text: string): QuoteDTO[] {
  const out: QuoteDTO[] = [];
  const re = /v_([a-z]{2}\d{6})="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const symbol = m[1];
    const fields = m[2].split('~');
    if (fields.length < 5) continue;
    const name = fields[1];
    const price = Number(fields[3]);
    const prevClose = Number(fields[4]);
    if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose === 0) continue;
    const growthPct = Number((((price - prevClose) / prevClose) * 100).toFixed(4));
    out.push({ symbol, name, price, prevClose, growthPct });
  }
  return out;
}

/**
 * 批量获取个股行情。腾讯接口返回 GBK 编码，需手动解码。
 * @param symbols 标准 symbol 列表，如 ['sh600519','sz000858']
 */
export async function fetchQuotes(symbols: string[]): Promise<QuoteDTO[]> {
  if (symbols.length === 0) return [];
  // 批量合并请求，规避子请求数限制；每批最多 60 只
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 60) {
    batches.push(symbols.slice(i, i + 60));
  }

  const all: QuoteDTO[] = [];
  for (const batch of batches) {
    const url = `https://qt.gtimg.cn/q=${batch.join(',')}`;
    const text = await fetchGbk(url);
    all.push(...parseTencentQuotes(text));
  }
  return all;
}

/** 获取 GBK 编码的上游文本并解码 */
async function fetchGbk(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gu.qq.com/' },
      signal: controller.signal,
    });
    if (!res.ok) throw new UpstreamError(res.status, `行情上游返回 ${res.status}`);
    const buf = await res.arrayBuffer();
    return decodeBody(buf);
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    if ((e as Error).name === 'AbortError') throw new UpstreamError(504, '行情请求超时');
    throw new UpstreamError(502, `行情请求失败: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
