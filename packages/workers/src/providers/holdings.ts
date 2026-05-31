import type { FundHoldingsDTO, HoldingDTO } from '../dto';
import { fetchText, UpstreamError } from '../lib/fetch';

/**
 * 天天基金公开持仓（季报披露重仓股）抓取与解析。
 * 接口返回 `var apidata={ content:"<html...>", ... }`，content 内是持仓明细表格。
 * 数据来自公开网络，季度披露，有滞后。
 */

/** 东方财富股票代码 → 标准 symbol。市场前缀：1=沪市(sh)，0=深市(sz)。 */
export function normalizeStockSymbol(emCode: string): string {
  // emCode 形如 "1.600519" 或 "0.000858"，也兼容纯 6 位
  const m = /(?:^|\b)([01])\.(\d{6})/.exec(emCode);
  if (m) {
    return (m[1] === '1' ? 'sh' : 'sz') + m[2];
  }
  const pure = /(\d{6})/.exec(emCode);
  if (pure) {
    // 退化：6/9 开头沪市，否则深市
    const code = pure[1];
    return (code.startsWith('6') || code.startsWith('9') ? 'sh' : 'sz') + code;
  }
  throw new UpstreamError(502, `无法识别股票代码: ${emCode}`);
}

/** 提取 var apidata={ content:"..." } 中的 content HTML */
export function extractApiDataContent(text: string): string {
  // content:"..." 字符串可能含转义引号，匹配到 ",arr 之前
  const m = /content:"((?:\\.|[^"\\])*)"/s.exec(text);
  if (!m) throw new UpstreamError(502, '持仓响应格式异常：未找到 content');
  // 还原 JS 字符串转义
  return m[1].replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n/g, '\n');
}

/** 解析持仓表格 HTML，返回重仓股列表 */
export function parseHoldingsHtml(html: string): { holdings: HoldingDTO[]; reportDate?: string } {
  // 报告期：截止至 <font ...>2026-03-31</font>
  const dateMatch = /截止至：<font[^>]*>(\d{4}-\d{2}-\d{2})<\/font>/.exec(html);
  const reportDate = dateMatch?.[1];

  const holdings: HoldingDTO[] = [];
  const tbody = /<tbody>(.*?)<\/tbody>/s.exec(html);
  if (!tbody) return { holdings, reportDate };

  const rowRe = /<tr>(.*?)<\/tr>/gs;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(tbody[1])) !== null) {
    const cells = row[1];
    // 股票代码（带市场前缀）来自 quote 链接：/unify/r/1.600519
    const codeMatch = /\/unify\/r\/([01]\.\d{6})/.exec(cells);
    // 占净值比例：形如 >9.92%<
    const weightMatch = />(\d+(?:\.\d+)?)%<\/td>/.exec(cells);
    if (!codeMatch || !weightMatch) continue;

    // 股票名称：行内第二个 quote 链接的文本（第一个是代码，第二个是名称）
    const anchorRe = /\/unify\/r\/[01]\.\d{6}'?\s*>([^<]+)<\/a>/g;
    const anchorTexts: string[] = [];
    let a: RegExpExecArray | null;
    while ((a = anchorRe.exec(cells)) !== null) anchorTexts.push(a[1].trim());
    const name = anchorTexts[1] ?? anchorTexts[0] ?? '';

    holdings.push({
      symbol: normalizeStockSymbol(codeMatch[1]),
      name,
      weightPct: Number(weightMatch[1]),
    });
  }
  return { holdings, reportDate };
}

/** 抓取基金重仓股持仓 */
export async function fetchFundHoldings(code: string, topN = 10): Promise<FundHoldingsDTO> {
  const url =
    `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}` +
    `&topline=${topN}&year=&month=&rt=${Date.now()}`;
  const text = await fetchText(url, { headers: { Referer: 'https://fundf10.eastmoney.com/' } });
  const content = extractApiDataContent(text);
  const { holdings, reportDate } = parseHoldingsHtml(content);
  const totalWeightPct = Number(holdings.reduce((acc, h) => acc + h.weightPct, 0).toFixed(2));
  return { fundCode: code, reportDate, holdings, totalWeightPct };
}
