import ReactECharts from 'echarts-for-react';
import type { FundDetail } from '@/services/fundPickerService';

interface Props {
  funds: FundDetail[];
  /** true=归一化（区间首日=100，便于多基金对比）；false=原始单位净值 */
  normalized: boolean;
  /** 基金代码 → 展示名称 */
  resolveName: (code: string) => string;
}

/**
 * 多基金净值走势对比图（需求 3）。
 * - 归一化模式：各基金以区间首个净值为基准缩放到 100，消除净值绝对值差异，便于对比涨跌；
 * - 原始模式：直接展示单位净值。
 * 横轴取所有基金中最长的交易日序列，缺失日按上一有效值延展。
 */
export function FundNavChart({ funds, normalized, resolveName }: Props) {
  // 取最长日期轴
  const dates = funds.reduce<string[]>((longest, f) => {
    const d = f.points.map((p) => p.date);
    return d.length > longest.length ? d : longest;
  }, []);

  const series = funds
    .filter((f) => f.points.length > 0)
    .map((f) => {
      const byDate = new Map(f.points.map((p) => [p.date, p.nav]));
      const base = f.points[0].nav || 1;
      let last: number | undefined;
      const data = dates.map((d) => {
        const v = byDate.get(d);
        if (v !== undefined) last = v;
        if (last === undefined) return null;
        return normalized ? Number(((last / base) * 100).toFixed(2)) : last;
      });
      const nm = resolveName(f.code);
      return {
        name: nm && nm !== f.code ? `${nm}(${f.code})` : f.code,
        type: 'line',
        data,
        showSymbol: false,
        connectNulls: true,
        lineStyle: { width: 2 },
      };
    });

  const option = {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) =>
        typeof v === 'number' ? (normalized ? v.toFixed(2) : v.toFixed(4)) : v,
    },
    legend: { data: series.map((s) => s.name), type: 'scroll' },
    grid: { left: 56, right: 20, top: 48, bottom: 64 },
    xAxis: { type: 'category', data: dates, boundaryGap: false },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { formatter: (v: number) => (normalized ? String(v) : v.toFixed(2)) },
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100 },
    ],
    series,
  };

  return <ReactECharts option={option} style={{ height: 400 }} notMerge />;
}
