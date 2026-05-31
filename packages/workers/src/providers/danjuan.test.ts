import { describe, it, expect } from 'vitest';
import { toValuationDTO, parseDanjuanHistory } from './danjuan';

describe('danjuan 估值解析', () => {
  const derived = {
    fd_code: '000001',
    end_date: '2026-05-29',
    unit_nav: '1.3080',
    unit_acc_nav: '3.8810',
    nav_grtd: '-3.5398',
  };

  it('转换为标准 ValuationDTO（最近确认净值）', () => {
    const dto = toValuationDTO(derived);
    expect(dto.fundCode).toBe('000001');
    expect(dto.source).toBe('danjuan');
    expect(dto.estimatedNav).toBe(1.308);
    expect(dto.estimatedGrowthPct).toBeCloseTo(-3.5398, 4);
    expect(dto.estimatedAt).toBe('2026-05-29');
    expect(dto.baseNavDate).toBe('2026-05-29');
  });
});

describe('danjuan 历史净值解析', () => {
  const items = [
    { date: '2026-05-29', nav: '1.3080', percentage: '-3.54' },
    { date: '2026-05-28', nav: '1.3560', percentage: '1.73' },
  ];

  it('解析并升序', () => {
    const points = parseDanjuanHistory(items);
    expect(points).toHaveLength(2);
    expect(points[0].date).toBe('2026-05-28');
    expect(points[1].date).toBe('2026-05-29');
    expect(points[0].nav).toBe(1.356);
  });
});
