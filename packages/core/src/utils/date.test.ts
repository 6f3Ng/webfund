import { describe, it, expect } from 'vitest';
import {
  addDays,
  dayOfWeek,
  isWeekend,
  diffDays,
  dateLte,
  dateLt,
  parseSubmitDateTime,
  isValidDateStr,
} from './date';

describe('date utils', () => {
  it('addDays 跨月跨年', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29'); // 闰年
  });

  it('dayOfWeek / isWeekend', () => {
    expect(dayOfWeek('2024-06-01')).toBe(6); // 周六
    expect(dayOfWeek('2024-06-02')).toBe(0); // 周日
    expect(dayOfWeek('2024-06-03')).toBe(1); // 周一
    expect(isWeekend('2024-06-01')).toBe(true);
    expect(isWeekend('2024-06-03')).toBe(false);
  });

  it('diffDays', () => {
    expect(diffDays('2024-01-01', '2024-01-08')).toBe(7);
    expect(diffDays('2024-01-08', '2024-01-01')).toBe(-7);
  });

  it('dateLte / dateLt', () => {
    expect(dateLte('2024-01-01', '2024-01-01')).toBe(true);
    expect(dateLt('2024-01-01', '2024-01-01')).toBe(false);
    expect(dateLt('2024-01-01', '2024-01-02')).toBe(true);
  });

  it('parseSubmitDateTime 解析墙钟时间，不受时区影响', () => {
    expect(parseSubmitDateTime('2024-06-03T14:30')).toEqual({
      date: '2024-06-03',
      hour: 14,
      minute: 30,
    });
    expect(parseSubmitDateTime('2024-06-03 15:00:00')).toEqual({
      date: '2024-06-03',
      hour: 15,
      minute: 0,
    });
    expect(parseSubmitDateTime('2024-06-03')).toEqual({ date: '2024-06-03', hour: 0, minute: 0 });
  });

  it('isValidDateStr', () => {
    expect(isValidDateStr('2024-06-03')).toBe(true);
    expect(isValidDateStr('2024-6-3')).toBe(false);
    expect(isValidDateStr('not-a-date')).toBe(false);
  });
});
