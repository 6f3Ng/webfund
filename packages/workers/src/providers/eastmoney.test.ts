import { describe, it, expect } from 'vitest';
import { parseGzJsonp, toValuationDTO, parseLsjz } from './eastmoney';

describe('eastmoney 估值解析', () => {
  // 真实样例（脱敏：结构来自公开接口）
  const sample =
    'jsonpgz({"fundcode":"000001","name":"华夏成长混合","jzrq":"2026-05-28","dwjz":"1.3560","gsz":"1.3097","gszzl":"-3.41","gztime":"2026-05-29 15:00"});';

  it('解析 JSONP 包裹', () => {
    const p = parseGzJsonp(sample);
    expect(p.fundcode).toBe('000001');
    expect(p.gsz).toBe('1.3097');
    expect(p.gszzl).toBe('-3.41');
  });

  it('转换为标准 ValuationDTO', () => {
    const dto = toValuationDTO(parseGzJsonp(sample));
    expect(dto).toEqual({
      fundCode: '000001',
      name: '华夏成长混合',
      source: 'eastmoney',
      estimatedNav: 1.3097,
      estimatedGrowthPct: -3.41,
      estimatedAt: '2026-05-29 15:00',
      baseNav: 1.356,
      baseNavDate: '2026-05-28',
    });
  });

  it('格式异常抛错', () => {
    expect(() => parseGzJsonp('not jsonp')).toThrow();
  });
});

describe('eastmoney 历史净值解析', () => {
  const resp = {
    Data: {
      LSJZList: [
        { FSRQ: '2026-05-29', DWJZ: '1.3080', LJJZ: '3.8810', JZZZL: '-3.54' },
        { FSRQ: '2026-05-28', DWJZ: '1.3560', LJJZ: '3.9290', JZZZL: '1.73' },
        { FSRQ: '2026-05-27', DWJZ: '1.3330', LJJZ: '3.9060', JZZZL: '-2.27' },
      ],
    },
  };

  it('解析并按日期升序', () => {
    const points = parseLsjz(resp);
    expect(points).toHaveLength(3);
    expect(points[0].date).toBe('2026-05-27'); // 升序
    expect(points[2].date).toBe('2026-05-29');
    expect(points[0].nav).toBe(1.333);
    expect(points[2].growthPct).toBe(-3.54);
  });

  it('空数据返回空数组', () => {
    expect(parseLsjz({})).toEqual([]);
    expect(parseLsjz({ Data: { LSJZList: [] } })).toEqual([]);
  });
});
