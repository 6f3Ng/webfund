import { addDays, isWeekend, isValidDateStr, dateLte, dateLt } from '../utils/date';

/**
 * 交易日历。支持注入法定节假日与特殊补班日；无数据时退化为"周末非交易日"。
 */
export class TradingCalendar {
  private readonly holidays: Set<string>;
  private readonly extraTradingDays: Set<string>;

  constructor(options?: {
    /** 法定节假日（非交易日），'YYYY-MM-DD' */
    holidays?: string[];
    /** 周末补班（视为交易日），'YYYY-MM-DD' */
    extraTradingDays?: string[];
  }) {
    this.holidays = new Set(options?.holidays ?? []);
    this.extraTradingDays = new Set(options?.extraTradingDays ?? []);
  }

  /** 是否交易日 */
  isTradingDay(date: string): boolean {
    if (!isValidDateStr(date)) throw new Error(`非法日期: ${date}`);
    if (this.extraTradingDays.has(date)) return true;
    if (this.holidays.has(date)) return false;
    return !isWeekend(date);
  }

  /** 返回 date（含）当天或之后的第一个交易日 */
  nextTradingDayOnOrAfter(date: string): string {
    let cur = date;
    for (let i = 0; i < 30; i++) {
      if (this.isTradingDay(cur)) return cur;
      cur = addDays(cur, 1);
    }
    throw new Error(`30 天内未找到交易日，起始: ${date}`);
  }

  /** 返回 date 之后（不含当天）的下一个交易日 */
  nextTradingDay(date: string): string {
    return this.nextTradingDayOnOrAfter(addDays(date, 1));
  }

  /** 返回 date（含）当天或之前的最近交易日 */
  prevTradingDayOnOrBefore(date: string): string {
    let cur = date;
    for (let i = 0; i < 30; i++) {
      if (this.isTradingDay(cur)) return cur;
      cur = addDays(cur, -1);
    }
    throw new Error(`30 天内未找到交易日，起始: ${date}`);
  }

  /** 返回 date 之前（不含当天）的上一个交易日 */
  prevTradingDay(date: string): string {
    return this.prevTradingDayOnOrBefore(addDays(date, -1));
  }

  /** 从 startDate 起加 n 个交易日（n>=0）。n=0 返回当天或之后第一个交易日。 */
  addTradingDays(startDate: string, n: number): string {
    if (n < 0) throw new Error('addTradingDays 不支持负数');
    let cur = this.nextTradingDayOnOrAfter(startDate);
    for (let i = 0; i < n; i++) {
      cur = this.nextTradingDay(cur);
    }
    return cur;
  }

  /** 列出 [start, end] 区间内所有交易日（含端点） */
  tradingDaysBetween(start: string, end: string): string[] {
    if (dateLt(end, start)) return [];
    const out: string[] = [];
    let cur = start;
    while (dateLte(cur, end)) {
      if (this.isTradingDay(cur)) out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }
}
