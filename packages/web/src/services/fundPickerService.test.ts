import { describe, it, expect } from 'vitest';
import { computeFundMetrics } from './fundPickerService';
import type { NavPointResponse } from '@/api/funds';

describe('fundPickerService.computeFundMetrics', () => {
  it('空序列返回零值指标', () => {
    const m = computeFundMetrics([]);
    expect(m.startNav).toBe(0);
    expect(m.endNav).toBe(0);
    expect(m.totalReturn).toBe(0);
    expect(m.tradingDays).toBe(0);
  });

  it('单调上涨：区间收益为正、最大回撤为 0', () => {
    const points: NavPointResponse[] = [
      { date: '2024-01-02', nav: 1.0 },
      { date: '2024-01-03', nav: 1.1 },
      { date: '2024-01-04', nav: 1.2 },
    ];
    const m = computeFundMetrics(points);
    expect(m.startNav).toBe(1.0);
    expect(m.endNav).toBe(1.2);
    expect(m.totalReturn).toBeCloseTo(0.2, 4);
    expect(m.maxDrawdown).toBe(0);
    expect(m.latestDate).toBe('2024-01-04');
    expect(m.tradingDays).toBe(3);
  });

  it('先涨后跌：最大回撤反映峰值到谷底的跌幅及日期', () => {
    const points: NavPointResponse[] = [
      { date: '2024-01-02', nav: 1.0 },
      { date: '2024-01-03', nav: 2.0 }, // 峰值
      { date: '2024-01-04', nav: 1.0 }, // 谷底，相对峰值跌 50%
    ];
    const m = computeFundMetrics(points);
    expect(m.maxDrawdown).toBeCloseTo(0.5, 4);
    expect(m.maxDrawdownPeakDate).toBe('2024-01-03');
    expect(m.maxDrawdownTroughDate).toBe('2024-01-04');
  });
});
