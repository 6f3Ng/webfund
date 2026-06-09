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

/**
 * 最大回撤展示：输入为正的回撤幅度（小数，如 0.3137），
 * 回撤代表下跌，按负值展示（"-31.37%"）；0 显示 "0.00%"。
 */
export function fmtDrawdown(v: number): string {
  if (v <= 0) return '0.00%';
  return `-${(v * 100).toFixed(2)}%`;
}

/** 回撤展示颜色：最大回撤一律用绿色（A股习惯：下跌为绿） */
export function drawdownColor(_v?: number): string {
  return '#3f8600';
}
