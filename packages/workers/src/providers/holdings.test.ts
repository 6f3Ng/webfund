import { describe, it, expect } from 'vitest';
import { normalizeStockSymbol, extractApiDataContent, parseHoldingsHtml } from './holdings';

describe('normalizeStockSymbol', () => {
  it('带市场前缀', () => {
    expect(normalizeStockSymbol('1.600519')).toBe('sh600519');
    expect(normalizeStockSymbol('0.000858')).toBe('sz000858');
  });
  it('纯代码退化推断', () => {
    expect(normalizeStockSymbol('600519')).toBe('sh600519');
    expect(normalizeStockSymbol('000858')).toBe('sz000858');
  });
});

describe('parseHoldingsHtml', () => {
  // 基于真实接口结构的精简样例
  const html =
    `<h4><label class='right'>截止至：<font class='px12'>2026-03-31</font></label></h4>` +
    `<table><tbody>` +
    `<tr><td>1</td><td class='toc'><a href='//quote.eastmoney.com/unify/r/1.600519'>600519</a></td>` +
    `<td class='toc'><a href='//quote.eastmoney.com/unify/r/1.600519'>贵州茅台</a></td>` +
    `<td><span>--</span></td><td><span>--</span></td><td class='xglj'><a>股吧</a></td>` +
    `<td class='toc'>9.92%</td><td class='toc'>65.30</td><td class='toc'>94,685.00</td></tr>` +
    `<tr><td>2</td><td class='toc'><a href='//quote.eastmoney.com/unify/r/0.000858'>000858</a></td>` +
    `<td class='toc'><a href='//quote.eastmoney.com/unify/r/0.000858'>五粮液</a></td>` +
    `<td><span>--</span></td><td><span>--</span></td><td class='xglj'><a>股吧</a></td>` +
    `<td class='toc'>7.50%</td><td class='toc'>50.00</td><td class='toc'>50,000.00</td></tr>` +
    `</tbody></table>`;

  it('解析报告期与持仓', () => {
    const { holdings, reportDate } = parseHoldingsHtml(html);
    expect(reportDate).toBe('2026-03-31');
    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toEqual({ symbol: 'sh600519', name: '贵州茅台', weightPct: 9.92 });
    expect(holdings[1]).toEqual({ symbol: 'sz000858', name: '五粮液', weightPct: 7.5 });
  });

  it('无 tbody 返回空', () => {
    expect(parseHoldingsHtml('<div>nothing</div>').holdings).toEqual([]);
  });
});

describe('extractApiDataContent', () => {
  it('提取 content 字段', () => {
    const text = `var apidata={ content:"<div>hello \\"world\\"</div>",arryear:[2026]};`;
    expect(extractApiDataContent(text)).toBe('<div>hello "world"</div>');
  });
});
