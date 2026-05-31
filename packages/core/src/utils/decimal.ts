import { PRECISION } from '../domain/constants';

/**
 * 四舍五入到指定小数位，规避浮点误差。
 * 采用"加极小 epsilon 后按位四舍五入"的稳健实现。
 */
export function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, digits);
  // 处理浮点边界（如 1.005 * 100 = 100.49999...）
  const shifted = value * factor;
  const rounded = Math.round(shifted + (shifted >= 0 ? 1e-7 : -1e-7));
  return rounded / factor;
}

/** 金额四舍五入（元，2 位） */
export function roundAmount(value: number): number {
  return round(value, PRECISION.AMOUNT);
}

/** 份额四舍五入（4 位） */
export function roundShares(value: number): number {
  return round(value, PRECISION.SHARES);
}

/** 净值/成本单价四舍五入（4 位） */
export function roundNav(value: number): number {
  return round(value, PRECISION.NAV);
}

/** 比率四舍五入（中间计算，8 位） */
export function roundRate(value: number): number {
  return round(value, PRECISION.RATE);
}

/** 安全加法（多金额求和后按金额位规整） */
export function sumAmount(...values: number[]): number {
  return roundAmount(values.reduce((acc, v) => acc + v, 0));
}

/** 判断两个数在给定精度内是否相等 */
export function approxEqual(a: number, b: number, digits = PRECISION.AMOUNT): boolean {
  return round(a, digits) === round(b, digits);
}

/** 限制在 [min, max] 区间 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
