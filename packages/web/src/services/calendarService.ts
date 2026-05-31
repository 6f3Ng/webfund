import { TradingCalendar } from '@fund/core';
import { fetchCalendar } from '@/api/funds';

let calendarPromise: Promise<TradingCalendar> | null = null;

/**
 * 获取交易日历（带进程内缓存）。从 Workers 拉取节假日数据构建 TradingCalendar，
 * 失败时退化为仅周末规则的空日历。
 */
export function getTradingCalendar(): Promise<TradingCalendar> {
  if (!calendarPromise) {
    calendarPromise = fetchCalendar()
      .then(
        (data) =>
          new TradingCalendar({
            holidays: data.holidays,
            extraTradingDays: data.extraTradingDays,
          }),
      )
      .catch(() => new TradingCalendar()); // 退化：周末规则
  }
  return calendarPromise;
}
