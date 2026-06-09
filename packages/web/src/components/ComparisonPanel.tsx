import { lazy, Suspense, useState } from 'react';
import {
  Card,
  Form,
  Select,
  Input,
  DatePicker,
  Button,
  Space,
  Table,
  Empty,
  App,
  Spin,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import type { BacktestResult, StrategySet } from '@fund/core';
import { collectFundCodes, loadNavData, runBacktestInWorker } from '@/services/backtestService';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useFundNames } from '@/hooks/useFundNames';
import { fmtMoney, fmtPct, pnlColor, fmtDrawdown, drawdownColor } from '@/utils/format';
import type { ComparisonItem } from './ComparisonChart';

const ComparisonChart = lazy(() =>
  import('./ComparisonChart').then((m) => ({ default: m.ComparisonChart })),
);

interface Props {
  sets: StrategySet[];
  purchaseFeeRate: number;
}

/** 指标对比表的列定义：从各结果取值 + 格式化 + 高亮最优 */
interface MetricRow {
  key: string;
  label: string;
  pick: (r: BacktestResult) => number;
  fmt: (v: number) => string;
  /** 'high' = 越大越优，'low' = 越小越优，'none' = 不高亮 */
  better: 'high' | 'low' | 'none';
}

const METRIC_ROWS: MetricRow[] = [
  { key: 'finalAssets', label: '期末总资产', pick: (r) => r.metrics.finalAssets, fmt: (v) => `¥${fmtMoney(v)}`, better: 'high' },
  { key: 'totalReturn', label: '总收益率', pick: (r) => r.metrics.totalReturn, fmt: (v) => fmtPct(v * 100), better: 'high' },
  { key: 'annualizedReturn', label: '年化收益', pick: (r) => r.metrics.annualizedReturn, fmt: (v) => fmtPct(v * 100), better: 'high' },
  { key: 'holdingReturn', label: '持有收益率', pick: (r) => r.metrics.holdingReturn, fmt: (v) => fmtPct(v * 100), better: 'high' },
  { key: 'holdingMaxDrawdown', label: '持有最大回撤', pick: (r) => r.metrics.holdingMaxDrawdown, fmt: (v) => fmtDrawdown(v), better: 'low' },
  { key: 'annualizedVolatility', label: '年化波动率', pick: (r) => r.metrics.annualizedVolatility, fmt: (v) => fmtPct(v * 100), better: 'low' },
  { key: 'sharpeRatio', label: '夏普比率', pick: (r) => r.metrics.sharpeRatio, fmt: (v) => v.toFixed(2), better: 'high' },
  { key: 'sortinoRatio', label: '索提诺比率', pick: (r) => r.metrics.sortinoRatio, fmt: (v) => v.toFixed(2), better: 'high' },
  { key: 'calmarRatio', label: '卡玛比率', pick: (r) => r.metrics.calmarRatio, fmt: (v) => v.toFixed(2), better: 'high' },
  { key: 'winningDaysRatio', label: '盈利日占比', pick: (r) => r.metrics.winningDaysRatio, fmt: (v) => fmtPct(v * 100), better: 'high' },
  { key: 'netInvested', label: '累计净投入', pick: (r) => r.metrics.netInvested, fmt: (v) => `¥${fmtMoney(v)}`, better: 'none' },
  { key: 'totalFee', label: '累计费用', pick: (r) => r.metrics.totalFee, fmt: (v) => `¥${fmtMoney(v)}`, better: 'low' },
  { key: 'tradeCount', label: '交易次数', pick: (r) => r.metrics.tradeCount, fmt: (v) => String(v), better: 'none' },
];

export function ComparisonPanel({ sets, purchaseFeeRate }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const isMobile = useIsMobile();
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<ComparisonItem[]>([]);
  // 初始资金不再由用户输入：各策略集由引擎自动推导所需资金；图表基线取各结果的最大期初资金
  const initialCash = items.reduce((m, it) => Math.max(m, it.result.metrics.initialCash), 0);

  // 名称解析（需求 4）：覆盖所有策略集涉及的标的，供基准下拉与曲线展示
  const allCodes = [...new Set(sets.flatMap((s) => collectFundCodes(s.strategies)))];
  const { resolve } = useFundNames(allCodes);
  const resolveLabel = (code: string) => {
    const nm = resolve(code);
    return nm && nm !== code ? `${nm}（${code}）` : code;
  };

  const handleRun = async () => {
    const v = await form.validateFields();
    const setIds: string[] = v.setIds;
    const chosen = sets.filter((s) => setIds.includes(s.id) && s.strategies.length > 0);
    if (chosen.length < 2) {
      message.warning('请选择至少两个含策略的策略集进行对比');
      return;
    }
    const [start, end] = v.range as [Dayjs, Dayjs];
    const startStr = start.format('YYYY-MM-DD');
    const endStr = end.format('YYYY-MM-DD');

    // 基准解析（需求 3）：优先基准策略集 > 基准基金 > 各自首个标的
    const benchSet =
      v.benchmarkSetId !== undefined
        ? sets.find((s) => s.id === v.benchmarkSetId && s.strategies.length > 0)
        : undefined;
    const benchFund = !benchSet ? (v.benchmarkFund as string | undefined)?.trim() : undefined;

    setRunning(true);
    setItems([]);
    try {
      // 汇总所有标的（含基准策略集/基准基金标的），一次性拉取历史净值，避免重复请求
      const allCodes = [...new Set(chosen.flatMap((s) => collectFundCodes(s.strategies)))];
      const loadCodes = new Set<string>(allCodes);
      if (benchSet) collectFundCodes(benchSet.strategies).forEach((c) => loadCodes.add(c));
      if (benchFund) loadCodes.add(benchFund);
      const navData = await loadNavData([...loadCodes], startStr, endStr);
      const totalPoints = Object.values(navData).reduce((acc, p) => acc + p.length, 0);
      if (totalPoints === 0) {
        message.error('未获取到该区间的历史净值');
        return;
      }

      const results = await Promise.all(
        chosen.map(async (s) => {
          const codes = collectFundCodes(s.strategies);
          // 子集净值需包含：本策略集标的 + 基准标的（修复非首个基准基金无净值导致基准失效的问题）
          const subCodes = new Set<string>(codes);
          if (benchSet) collectFundCodes(benchSet.strategies).forEach((c) => subCodes.add(c));
          if (benchFund) subCodes.add(benchFund);
          const subNav = Object.fromEntries([...subCodes].map((c) => [c, navData[c] ?? []]));
          const result = await runBacktestInWorker({
            strategies: s.strategies,
            conflictPolicy: s.conflictPolicy,
            navData: subNav,
            start: startStr,
            end: endStr,
            purchaseFeeRate,
            ...(benchSet
              ? {
                  benchmarkStrategies: benchSet.strategies,
                  benchmarkConflictPolicy: benchSet.conflictPolicy,
                  benchmarkLabel: benchSet.name,
                }
              : { benchmarkFundCode: benchFund || codes[0] }),
          });
          return { name: s.name, result } as ComparisonItem;
        }),
      );
      setItems(results);
      message.success(`已对比 ${results.length} 个策略集`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '对比回测失败');
    } finally {
      setRunning(false);
    }
  };

  // 指标对比表：行=指标，列=各策略集
  const bestByRow = new Map<string, number>();
  for (const row of METRIC_ROWS) {
    if (row.better === 'none' || items.length === 0) continue;
    const vals = items.map((it) => row.pick(it.result));
    bestByRow.set(row.key, row.better === 'high' ? Math.max(...vals) : Math.min(...vals));
  }

  const tableColumns = [
    { title: '指标', dataIndex: 'label', key: 'label', fixed: 'left' as const, width: 130 },
    ...items.map((it, idx) => ({
      title: it.name,
      key: `set_${idx}`,
      render: (_: unknown, row: MetricRow) => {
        const val = row.pick(it.result);
        const isBest = row.better !== 'none' && bestByRow.get(row.key) === val && items.length > 1;
        const colorRows = new Set(['totalReturn', 'annualizedReturn', 'holdingReturn']);
        const color =
          row.key === 'holdingMaxDrawdown'
            ? drawdownColor(val)
            : colorRows.has(row.key)
              ? pnlColor(val)
              : undefined;
        return (
          <span style={{ fontWeight: isBest ? 700 : 400, color }}>
            {row.fmt(val)}
            {isBest ? ' ★' : ''}
          </span>
        );
      },
    })),
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card title="多策略集横向对比">
        <Form form={form} layout={isMobile ? 'vertical' : 'inline'} style={{ rowGap: 12 }}>
          <Form.Item
            name="setIds"
            label="策略集"
            rules={[{ required: true, message: '请选择至少两个' }]}
          >
            <Select
              mode="multiple"
              style={{ minWidth: 280, width: isMobile ? '100%' : undefined }}
              placeholder="选择 2+ 个策略集"
              maxTagCount="responsive"
              options={sets.map((s) => ({
                label: `${s.name}（${s.strategies.length}）`,
                value: s.id,
                disabled: s.strategies.length === 0,
              }))}
              onChange={() => {
                form.setFieldValue?.('benchmarkSetId', undefined);
                form.setFieldValue?.('benchmarkFund', undefined);
              }}
            />
          </Form.Item>
          <Form.Item name="range" label="区间" rules={[{ required: true, message: '请选择区间' }]}>
            <DatePicker.RangePicker style={{ width: isMobile ? '100%' : undefined }} />
          </Form.Item>
          <Form.Item name="benchmarkSetId" label="基准策略集">
            <Select
              style={{ minWidth: 160, width: isMobile ? '100%' : undefined }}
              placeholder="选择一条策略作基准（可选）"
              allowClear
              options={sets
                .filter((s) => s.strategies.length > 0)
                .map((s) => ({ label: `${s.name}（${s.strategies.length}）`, value: s.id }))}
              onChange={(val) => {
                if (val) form.setFieldValue('benchmarkFund', undefined);
              }}
            />
          </Form.Item>
          <Form.Item
            name="benchmarkFund"
            label="基准基金"
            tooltip="未选基准策略集时生效；留空则各策略集默认首个标的买入持有"
          >
            <Input
              style={{ width: isMobile ? '100%' : 140 }}
              placeholder="基金代码（可选）"
              maxLength={6}
              allowClear
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" loading={running} onClick={handleRun} block={isMobile}>
              运行对比
            </Button>
          </Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          各策略集使用相同区间、初始资金与费率独立回测后对比；表中 ★ 标记该指标的最优者。
        </Typography.Paragraph>
      </Card>

      {items.length === 0 && !running && (
        <Card>
          <Empty description="选择多个策略集后运行对比" />
        </Card>
      )}

      {items.length > 0 && (
        <>
          <Card title="指标对比">
            <Table
              rowKey="key"
              dataSource={METRIC_ROWS}
              columns={tableColumns}
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
            />
          </Card>
          <Card title="总资产曲线对比">
            <Suspense fallback={<Spin />}>
              <ComparisonChart items={items} initialCash={initialCash} resolveName={resolveLabel} />
            </Suspense>
          </Card>
        </>
      )}
    </Space>
  );
}
