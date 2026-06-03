import ReactECharts from 'echarts-for-react';
import type { HoldingResponse } from '@/api/funds';

/**
 * 单只基金重仓股权重条形图（需求 3）。横向条形，按权重降序展示前 N 大重仓。
 */
export function FundHoldingsChart({ holdings }: { holdings: HoldingResponse[] }) {
  const sorted = [...holdings].sort((a, b) => b.weightPct - a.weightPct);
  const names = sorted.map((h) => h.name || h.symbol);
  const weights = sorted.map((h) => Number(h.weightPct.toFixed(2)));

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => (typeof v === 'number' ? `${v.toFixed(2)}%` : v),
    },
    grid: { left: 8, right: 24, top: 16, bottom: 24, containLabel: true },
    xAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: [...names].reverse(), axisLabel: { width: 90, overflow: 'truncate' } },
    series: [
      {
        type: 'bar',
        data: [...weights].reverse(),
        itemStyle: { color: '#1677ff' },
        label: { show: true, position: 'right', formatter: (p: { value: number }) => `${p.value}%` },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: Math.max(220, names.length * 34 + 60) }} notMerge />;
}
