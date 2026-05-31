import ReactECharts from 'echarts-for-react';
import type { BacktestResult } from '@fund/core';

interface Props {
  result: BacktestResult;
  initialCash: number;
}

/**
 * 回测曲线：
 * - 总资产（现金 + 持仓市值）
 * - 持仓市值（仅基金持有部分）
 * - 累计净投入资金
 * - 持仓成本
 * - 基准（买入持有）
 */
export function BacktestChart({ result, initialCash }: Props) {
  const dates = result.curve.map((p) => p.date);
  const totalAssets = result.curve.map((p) => p.totalAssets);
  const marketValue = result.curve.map((p) => p.marketValue);
  const invested = result.curve.map((p) => p.investedCapital);
  const cost = result.curve.map((p) => p.cost);
  const benchmarkSeries = result.benchmark?.curve.map((p) => p.totalAssets) ?? [];

  const legend = ['总资产', '持仓市值', '累计净投入', '持仓成本'];
  if (benchmarkSeries.length) legend.push('基准(买入持有)');

  const option = {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => (typeof v === 'number' ? `¥${v.toLocaleString('zh-CN')}` : v),
    },
    legend: { data: legend, type: 'scroll' },
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
    series: [
      {
        name: '总资产',
        type: 'line',
        data: totalAssets,
        showSymbol: false,
        lineStyle: { width: 2 },
        markLine: {
          silent: true,
          data: [{ yAxis: initialCash, name: '期初资金' }],
          lineStyle: { type: 'dashed', color: '#999' },
        },
      },
      {
        name: '持仓市值',
        type: 'line',
        data: marketValue,
        showSymbol: false,
        areaStyle: { opacity: 0.1 },
        lineStyle: { width: 1.5 },
      },
      {
        name: '累计净投入',
        type: 'line',
        data: invested,
        showSymbol: false,
        step: 'end',
        lineStyle: { width: 1.5, type: 'dotted' },
      },
      {
        name: '持仓成本',
        type: 'line',
        data: cost,
        showSymbol: false,
        lineStyle: { width: 1, type: 'dashed' },
      },
      ...(benchmarkSeries.length
        ? [
            {
              name: '基准(买入持有)',
              type: 'line',
              data: benchmarkSeries,
              showSymbol: false,
              lineStyle: { width: 2, type: 'dashed' },
            },
          ]
        : []),
    ],
  };

  return <ReactECharts option={option} style={{ height: 400 }} notMerge />;
}
