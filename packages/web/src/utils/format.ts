/** 金额格式化（元，千分位 2 位） */
export function fmtMoney(v: number): string {
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 份额格式化（4 位） */
export function fmtShares(v: number): string {
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** 百分比格式化（输入为小数，如 0.1234 → "12.34%"） */
export function fmtRate(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

/** 涨跌幅格式化（输入已是百分比数值，如 -3.41 → "-3.41%"） */
export function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

/** 涨跌颜色（红涨绿跌，A股习惯） */
export function pnlColor(v: number): string {
  if (v > 0) return '#cf1322';
  if (v < 0) return '#3f8600';
  return 'inherit';
}
