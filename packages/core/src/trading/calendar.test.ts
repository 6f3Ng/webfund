import { describe, it, expect } from 'vitest';
import { TradingCalendar } from './calendar';

describe('TradingCalendar', () => {
  // 2024 国庆假期 10-01 ~ 10-07，9-29(周日)与 10-12(周六)补班
  const cal = new TradingCalendar({
    holidays: [
      '2024-10-01',
      '2024-10-02',
      '2024-10-03',
      '2024-10-04',
      '2024-10-07',
    ],
    extraTradingDays: ['2024-09-29', '2024-10-12'],
  });

  it('周末非交易日，工作日为交易日', () => {
    expect(cal.isTradingDay('2024-06-03')).toBe(true); // 周一
    expect(cal.isTradingDay('2024-06-01')).toBe(false); // 周六
  });

  it('法定节假日非交易日', () => {
    expect(cal.isTradingDay('2024-10-01')).toBe(false);
    expect(cal.isTradingDay('2024-10-07')).toBe(false);
  });

  it('补班日为交易日', () => {
    expect(cal.isTradingDay('2024-09-29')).toBe(true); // 周日补班
    expect(cal.isTradingDay('2024-10-12')).toBe(true); // 周六补班
  });

  it('nextTradingDay 跳过节假日', () => {
    // 9-30(周一)申报后的下一交易日应为 10-08(周二)
    expect(cal.nextTradingDay('2024-09-30')).toBe('2024-10-08');
  });

  it('nextTradingDayOnOrAfter', () => {
    expect(cal.nextTradingDayOnOrAfter('2024-10-01')).toBe('2024-10-08');
    expect(cal.nextTradingDayOnOrAfter('2024-10-08')).toBe('2024-10-08');
  });

  it('prevTradingDay', () => {
    expect(cal.prevTradingDay('2024-10-08')).toBe('2024-09-30');
  });

  it('addTradingDays 跨假期', () => {
    // 从 9-30 起 +1 交易日 = 10-08
    expect(cal.addTradingDays('2024-09-30', 1)).toBe('2024-10-08');
    // 从 9-30 起 +0 = 9-30 本身
    expect(cal.addTradingDays('2024-09-30', 0)).toBe('2024-09-30');
    // +2 = 10-09
    expect(cal.addTradingDays('2024-09-30', 2)).toBe('2024-10-09');
  });

  it('tradingDaysBetween 含补班、去节假日', () => {
    const days = cal.tradingDaysBetween('2024-09-28', '2024-10-09');
    expect(days).toEqual([
      '2024-09-29', // 补班
      '2024-09-30',
      '2024-10-08',
      '2024-10-09',
    ]);
  });

  it('无数据时退化为周末规则', () => {
    const plain = new TradingCalendar();
    expect(plain.isTradingDay('2024-10-01')).toBe(true); // 无节假日数据，工作日即交易日
    expect(plain.isTradingDay('2024-06-01')).toBe(false); // 周末
  });
});
