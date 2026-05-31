import { HOLIDAYS, EXTRA_TRADING_DAYS, COVERED_YEARS } from '../data/holidays';

export interface CalendarPayload {
  /** 覆盖的年份 */
  coveredYears: number[];
  holidays: string[];
  extraTradingDays: string[];
}

/** 返回交易日历静态数据（前端核心库注入 TradingCalendar 使用） */
export function getCalendarData(year?: number): CalendarPayload {
  if (year) {
    const prefix = `${year}-`;
    return {
      coveredYears: COVERED_YEARS.includes(year) ? [year] : [],
      holidays: HOLIDAYS.filter((d) => d.startsWith(prefix)),
      extraTradingDays: EXTRA_TRADING_DAYS.filter((d) => d.startsWith(prefix)),
    };
  }
  return {
    coveredYears: COVERED_YEARS,
    holidays: HOLIDAYS,
    extraTradingDays: EXTRA_TRADING_DAYS,
  };
}
