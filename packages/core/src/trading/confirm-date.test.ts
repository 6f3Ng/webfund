import { describe, it, expect } from 'vitest';
import { TradingCalendar } from './calendar';
import { calcConfirmDate } from './confirm-date';

describe('calcConfirmDate', () => {
  const cal = new TradingCalendar({
    holidays: ['2024-10-01', '2024-10-02', '2024-10-03', '2024-10-04', '2024-10-07'],
  });

  it('交易日 15:00 前 → 当日确认', () => {
    expect(calcConfirmDate('2024-06-03T14:59', cal)).toBe('2024-06-03');
    expect(calcConfirmDate('2024-06-03T09:30', cal)).toBe('2024-06-03');
  });

  it('交易日 15:00 当刻及之后 → 下一交易日', () => {
    expect(calcConfirmDate('2024-06-03T15:00', cal)).toBe('2024-06-04');
    expect(calcConfirmDate('2024-06-03T15:01', cal)).toBe('2024-06-04');
  });

  it('周五 15:00 后 → 下周一', () => {
    // 2024-06-07 周五
    expect(calcConfirmDate('2024-06-07T16:00', cal)).toBe('2024-06-10');
  });

  it('周末申报 → 下周一', () => {
    expect(calcConfirmDate('2024-06-01T10:00', cal)).toBe('2024-06-03'); // 周六
    expect(calcConfirmDate('2024-06-02T10:00', cal)).toBe('2024-06-03'); // 周日
  });

  it('节假日前 15:00 后 → 节后第一个交易日', () => {
    // 9-30 周一 15:00 后 → 10-08
    expect(calcConfirmDate('2024-09-30T15:30', cal)).toBe('2024-10-08');
  });

  it('节假日当天申报 → 节后第一个交易日', () => {
    expect(calcConfirmDate('2024-10-03T10:00', cal)).toBe('2024-10-08');
  });

  it('无时分默认 00:00 → 视为 15:00 前', () => {
    expect(calcConfirmDate('2024-06-03', cal)).toBe('2024-06-03');
  });
});
