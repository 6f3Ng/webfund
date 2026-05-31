import { describe, it, expect } from 'vitest';
import { getCalendarData } from './calendar';

describe('calendar 数据', () => {
  it('返回全部年份数据', () => {
    const data = getCalendarData();
    expect(data.coveredYears).toContain(2024);
    expect(data.holidays).toContain('2024-10-01');
    expect(data.extraTradingDays).toContain('2024-09-29');
  });

  it('按年份过滤', () => {
    const data = getCalendarData(2024);
    expect(data.coveredYears).toEqual([2024]);
    expect(data.holidays.every((d) => d.startsWith('2024-'))).toBe(true);
    expect(data.holidays).toContain('2024-10-01');
    expect(data.holidays).not.toContain('2023-01-02');
  });

  it('未覆盖年份返回空', () => {
    const data = getCalendarData(2099);
    expect(data.coveredYears).toEqual([]);
    expect(data.holidays).toEqual([]);
  });
});
