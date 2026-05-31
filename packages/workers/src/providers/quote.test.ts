import { describe, it, expect } from 'vitest';
import { parseTencentQuotes } from './quote';

describe('parseTencentQuotes', () => {
  it('解析单只行情并计算涨跌幅', () => {
    // v_sh600519="1~贵州茅台~600519~现价~昨收~..."
    const text = 'v_sh600519="1~贵州茅台~600519~1326.00~1275.98~1270.60~76478~...";';
    const quotes = parseTencentQuotes(text);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].symbol).toBe('sh600519');
    expect(quotes[0].price).toBe(1326);
    expect(quotes[0].prevClose).toBe(1275.98);
    // (1326 - 1275.98)/1275.98 * 100 ≈ 3.9201%
    expect(quotes[0].growthPct).toBeCloseTo(3.9201, 3);
  });

  it('解析多只', () => {
    const text =
      'v_sh600519="1~茅台~600519~100~100~...";\n' + 'v_sz000858="51~五粮液~000858~110~100~...";';
    const quotes = parseTencentQuotes(text);
    expect(quotes).toHaveLength(2);
    expect(quotes[0].growthPct).toBe(0);
    expect(quotes[1].growthPct).toBeCloseTo(10, 4);
  });

  it('昨收为 0 时跳过（避免除零）', () => {
    const text = 'v_sh600519="1~x~600519~100~0~...";';
    expect(parseTencentQuotes(text)).toHaveLength(0);
  });

  it('空输入返回空', () => {
    expect(parseTencentQuotes('')).toEqual([]);
  });
});
