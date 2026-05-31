import { NAV_CUTOFF_HOUR, NAV_CUTOFF_MINUTE } from '../domain/constants';
import { parseSubmitDateTime } from '../utils/date';
import type { TradingCalendar } from './calendar';

/**
 * 计算场外基金交易的确认日（成交净值取值日）。
 * 规则：
 *  - 申报时间 T，15:00 为分界；
 *  - 若 T 是交易日且 15:00 前 → 确认日 = T；
 *  - 否则（15:00 后，或 T 非交易日）→ 确认日 = T 之后的第一个交易日。
 *
 * @param submitAt 申报时间，'YYYY-MM-DD[THH:mm]'（按市场墙钟时间）
 */
export function calcConfirmDate(submitAt: string, calendar: TradingCalendar): string {
  const { date, hour, minute } = parseSubmitDateTime(submitAt);
  const beforeCutoff =
    hour < NAV_CUTOFF_HOUR || (hour === NAV_CUTOFF_HOUR && minute < NAV_CUTOFF_MINUTE);

  if (calendar.isTradingDay(date) && beforeCutoff) {
    return date;
  }
  // 15:00 后或非交易日：顺延到下一个交易日
  return calendar.nextTradingDay(date);
}
