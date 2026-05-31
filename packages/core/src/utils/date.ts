/**
 * 平台无关的日期工具，统一使用 'YYYY-MM-DD' 字符串作为交易日表示，
 * 仅做纯日期运算（不含时区/时分），避免跨平台 Date 时区差异。
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateStr(s: string): boolean {
  return DATE_RE.test(s);
}

/** 'YYYY-MM-DD' → UTC 毫秒（用于稳定的日期加减/比较） */
export function dateToUtcMs(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`非法日期格式: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** UTC 毫秒 → 'YYYY-MM-DD' */
export function utcMsToDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** 在日期上加 n 个自然日 */
export function addDays(date: string, n: number): string {
  return utcMsToDate(dateToUtcMs(date) + n * 86400000);
}

/** 返回星期几：0=周日, 6=周六 */
export function dayOfWeek(date: string): number {
  return new Date(dateToUtcMs(date)).getUTCDay();
}

/** 是否周末 */
export function isWeekend(date: string): boolean {
  const d = dayOfWeek(date);
  return d === 0 || d === 6;
}

/** 两个日期相差的自然天数 (b - a) */
export function diffDays(a: string, b: string): number {
  return Math.round((dateToUtcMs(b) - dateToUtcMs(a)) / 86400000);
}

/** a <= b */
export function dateLte(a: string, b: string): boolean {
  return dateToUtcMs(a) <= dateToUtcMs(b);
}

/** a < b */
export function dateLt(a: string, b: string): boolean {
  return dateToUtcMs(a) < dateToUtcMs(b);
}

/** 从提交时间字符串中取出日期与时分（按"市场本地墙钟时间"解析字面量，避免时区漂移）。
 *  支持 'YYYY-MM-DD'、'YYYY-MM-DDTHH:mm'、'YYYY-MM-DD HH:mm[:ss]' 等形式。 */
export function parseSubmitDateTime(input: string): { date: string; hour: number; minute: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(input.trim());
  if (!m) throw new Error(`非法时间格式: ${input}`);
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
    hour: m[4] ? Number(m[4]) : 0,
    minute: m[5] ? Number(m[5]) : 0,
  };
}
