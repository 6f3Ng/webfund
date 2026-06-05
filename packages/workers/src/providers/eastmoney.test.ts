import { describe, it, expect } from 'vitest';
import { parseGzJsonp, toValuationDTO, parseLsjz, parsePingzhongHistory, tsToDate } from './eastmoney';

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

describe('eastmoney pingzhongdata 历史净值解析（单请求全量）', () => {
  // 真实结构样例：时间戳为北京时间当日 0 点对应的 UTC 毫秒
  const sample = `
    var fS_name = "测试基金";
    var Data_netWorthTrend = [{"x":1432656000000,"y":1.0,"equityReturn":0,"unitMoney":""},{"x":1432828800000,"y":0.995,"equityReturn":-0.5,"unitMoney":""},{"x":1433347200000,"y":0.997,"equityReturn":0.2,"unitMoney":""}];
    var Data_ACWorthTrend = [[1432656000000,1.0],[1432828800000,0.995],[1433347200000,0.997]];
    var Data_grandTotal = [];
  `;

  it('时间戳按北京时间转日期', () => {
    expect(tsToDate(1432656000000)).toBe('2015-05-27');
    expect(tsToDate(1780502400000)).toBe('2026-06-04');
  });

  it('解析并合并单位净值与累计净值，按日期升序', () => {
    const points = parsePingzhongHistory(sample);
    expect(points).toHaveLength(3);
    expect(points[0].date).toBe('2015-05-27');
    expect(points[0].nav).toBe(1.0);
    expect(points[0].accNav).toBe(1.0);
    expect(points[1].nav).toBe(0.995);
    expect(points[1].growthPct).toBe(-0.5);
    expect(points[2].date).toBe('2015-06-04');
  });

  it('按 start/end 区间过滤', () => {
    const points = parsePingzhongHistory(sample, '2015-05-28', '2015-06-04');
    expect(points.map((p) => p.date)).toEqual(['2015-05-29', '2015-06-04']);
  });

  it('格式异常抛错', () => {
    expect(() => parsePingzhongHistory('no data here')).toThrow();
  });
});
