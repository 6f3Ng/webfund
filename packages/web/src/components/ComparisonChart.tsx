import ReactECharts from 'echarts-for-react';
import type { BacktestResult } from '@fund/core';

export interface ComparisonItem {
  name: string;
  result: BacktestResult;
}

/**
 * 多策略集对比曲线：每个策略集一条"总资产"曲线，叠加基准（取第一个有基准的）。
 * 横轴取所有结果中最长的日期序列，缺失日期按上一有效值延展。
 */
export function ComparisonChart({
  items,
  initialCash,
  resolveName,
}: {
  items: ComparisonItem[];
  initialCash: number;
  /** 基金代码 → 展示名称（需求 4：基准曲线展示名称 + 代码） */
  resolveName?: (code: string) => string;
}) {
  // 取最长日期轴
  const dates = items.reduce<string[]>((longest, it) => {
    const d = it.result.curve.map((p) => p.date);
    return d.length > longest.length ? d : longest;
  }, []);

  const series = items.map((it) => {
    const byDate = new Map(it.result.curve.map((p) => [p.date, p.totalAssets]));
    let lastVal = initialCash;
    const data = dates.map((d) => {
      const v = byDate.get(d);
      if (v !== undefined) lastVal = v;
      return lastVal;
    });
    return {
      name: it.name,
      type: 'line',
      data,
      showSymbol: false,
      lineStyle: { width: 2 },
    };
  });

  // 基准（用第一个含基准的结果）
  const withBenchmark = items.find((it) => it.result.benchmark);
  if (withBenchmark?.result.benchmark) {
    const bm = withBenchmark.result.benchmark;
    const byDate = new Map(bm.curve.map((p) => [p.date, p.totalAssets]));
    let lastVal = initialCash;
    const bmLabel =
      bm.kind === 'STRATEGY'
        ? `策略${bm.label ? `:${bm.label}` : ''}`
        : `${resolveName && bm.fundCode ? resolveName(bm.fundCode) : (bm.fundCode ?? '')}买入持有`;
    series.push({
      name: `基准(${bmLabel})`,
      type: 'line',
      data: dates.map((d) => {
        const v = byDate.get(d);
        if (v !== undefined) lastVal = v;
        return lastVal;
      }),
      showSymbol: false,
      lineStyle: { width: 2, type: 'dashed' } as never,
    });
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => (typeof v === 'number' ? `¥${v.toLocaleString('zh-CN')}` : v),
    },
    legend: { data: series.map((s) => s.name), type: 'scroll' },
    grid: { left: 64, right: 20, top: 48, bottom: 64 },
    xAxis: { type: 'category', data: dates, boundaryGap: false },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { formatter: (v: number) => `¥${(v / 10000).toFixed(1)}w` },
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100 },
    ],
    series,
  };

  return <ReactECharts option={option} style={{ height: 400 }} notMerge />;
}
