import { lazy, Suspense, useState, type ReactNode } from 'react';
import {
  Card,
  Form,
  Input,
  DatePicker,
  Button,
  Space,
  Table,
  Tag,
  Empty,
  App,
  Spin,
  Segmented,
  Typography,
  Row,
  Col,
  Statistic,
  Tooltip,
  Alert,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { loadFundDetails, type FundDetail } from '@/services/fundPickerService';
import { useFundNames } from '@/hooks/useFundNames';
import { useIsMobile } from '@/hooks/useIsMobile';
import { fmtPct, pnlColor, fmtDrawdown, drawdownColor } from '@/utils/format';
import { FundCell } from '@/components/FundLabel';

const FundNavChart = lazy(() =>
  import('@/components/FundNavChart').then((m) => ({ default: m.FundNavChart })),
);
const FundHoldingsChart = lazy(() =>
  import('@/components/FundHoldingsChart').then((m) => ({ default: m.FundHoldingsChart })),
);

/** 校验并去重 6 位基金代码（逗号/空格/换行分隔） */
function parseCodes(raw: string): string[] {
  const parts = raw
    .split(/[\s,，、]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(parts.filter((c) => /^\d{6}$/.test(c)))];
}

export function FundPickerPage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [funds, setFunds] = useState<FundDetail[]>([]);
  const [normalized, setNormalized] = useState(true);

  const codes = funds.map((f) => f.code);
  const { resolve } = useFundNames(codes);

  const handleQuery = async () => {
    const v = await form.validateFields();
    const list = parseCodes(v.codes ?? '');
    if (list.length === 0) {
      message.warning('请输入至少一个 6 位基金代码');
      return;
    }
    if (list.length > 8) {
      message.warning('一次最多对比 8 只基金');
      return;
    }
    const [start, end] = v.range as [Dayjs, Dayjs];
    const startStr = start.format('YYYY-MM-DD');
    const endStr = end.format('YYYY-MM-DD');

    setLoading(true);
    setFunds([]);
    try {
      const details = await loadFundDetails(list, startStr, endStr);
      const withData = details.filter((d) => d.points.length > 0 || d.holdings.length > 0);
      if (withData.length === 0) {
        message.error('未获取到所选基金的数据，请检查代码与区间');
      }
      setFunds(details);
      message.success(`已加载 ${details.length} 只基金`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '基金数据获取失败');
    } finally {
      setLoading(false);
    }
  };

  // 指标对比表：行=指标，列=各基金
  interface MetricRow {
    key: string;
    label: string;
    pick: (f: FundDetail) => number;
    fmt: (v: number) => string;
    better: 'high' | 'low' | 'none';
    color?: boolean;
    /** 回撤类指标：数值一律用绿色展示 */
    drawdown?: boolean;
    /** 自定义单元格渲染（用于"回撤修复天数""历史已修复最大回撤"等非纯数值展示） */
    renderCell?: (f: FundDetail) => ReactNode;
  }
  const metricRows: MetricRow[] = [
    { key: 'endNav', label: '最新净值', pick: (f) => f.metrics.endNav, fmt: (v) => v.toFixed(4), better: 'none' },
    { key: 'totalReturn', label: '区间收益率', pick: (f) => f.metrics.totalReturn, fmt: (v) => fmtPct(v * 100), better: 'high', color: true },
    { key: 'annualizedReturn', label: '年化收益', pick: (f) => f.metrics.annualizedReturn, fmt: (v) => fmtPct(v * 100), better: 'high', color: true },
    { key: 'maxDrawdown', label: '最大回撤', pick: (f) => f.metrics.maxDrawdown, fmt: (v) => fmtDrawdown(v), better: 'low', drawdown: true },
    {
      key: 'maxDrawdownRecovery',
      label: '回撤修复天数',
      pick: (f) => f.metrics.maxDrawdownRecoveryDays ?? Infinity,
      fmt: () => '',
      better: 'none',
      renderCell: (f) =>
        f.metrics.maxDrawdown <= 0
          ? '—'
          : f.metrics.maxDrawdownRecoveryDays !== undefined
            ? `${f.metrics.maxDrawdownRecoveryDays} 天`
            : `未修复（${f.metrics.maxDrawdownDaysSinceTrough ?? 0}天）`,
    },
    {
      key: 'recoveredMaxDrawdown',
      label: '历史已修复最大回撤',
      pick: (f) => f.metrics.recoveredMaxDrawdown ?? 0,
      fmt: (v) => fmtDrawdown(v),
      better: 'none',
      renderCell: (f) => {
        // 仅当前回撤未修复且存在历史已修复回撤时展示，否则 —
        const unrecovered =
          f.metrics.maxDrawdownRecoveryDays === undefined && f.metrics.maxDrawdown > 0;
        const rec = f.metrics.recoveredMaxDrawdown ?? 0;
        if (!unrecovered || rec <= 0) return '—';
        return (
          <span style={{ color: drawdownColor(rec) }}>
            {fmtDrawdown(rec)} / {f.metrics.recoveredMaxDrawdownRecoveryDays}天
          </span>
        );
      },
    },
    { key: 'annualizedVolatility', label: '年化波动率', pick: (f) => f.metrics.annualizedVolatility, fmt: (v) => fmtPct(v * 100), better: 'low' },
    { key: 'sharpeRatio', label: '夏普比率', pick: (f) => f.metrics.sharpeRatio, fmt: (v) => v.toFixed(2), better: 'high' },
    { key: 'sortinoRatio', label: '索提诺比率', pick: (f) => f.metrics.sortinoRatio, fmt: (v) => v.toFixed(2), better: 'high' },
    { key: 'calmarRatio', label: '卡玛比率', pick: (f) => f.metrics.calmarRatio, fmt: (v) => v.toFixed(2), better: 'high' },
    { key: 'winningDaysRatio', label: '盈利日占比', pick: (f) => f.metrics.winningDaysRatio, fmt: (v) => fmtPct(v * 100), better: 'high' },
    { key: 'tradingDays', label: '区间交易日', pick: (f) => f.metrics.tradingDays, fmt: (v) => String(v), better: 'none' },
  ];

  const dataFunds = funds.filter((f) => f.points.length > 0);
  const bestByRow = new Map<string, number>();
  for (const row of metricRows) {
    if (row.better === 'none' || dataFunds.length === 0) continue;
    const vals = dataFunds.map((f) => row.pick(f));
    bestByRow.set(row.key, row.better === 'high' ? Math.max(...vals) : Math.min(...vals));
  }

  const metricColumns = [
    { title: '指标', dataIndex: 'label', key: 'label', fixed: 'left' as const, width: 120 },
    ...dataFunds.map((f, idx) => ({
      title: <FundCell code={f.code} name={resolve(f.code)} />,
      key: `f_${idx}`,
      render: (_: unknown, row: MetricRow) => {
        if (row.renderCell) return row.renderCell(f);
        const val = row.pick(f);
        const isBest = row.better !== 'none' && bestByRow.get(row.key) === val && dataFunds.length > 1;
        const color = row.drawdown ? drawdownColor(val) : row.color ? pnlColor(val) : undefined;
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
      <Card title="选基">
        <Form form={form} layout={isMobile ? 'vertical' : 'inline'} style={{ rowGap: 12 }}>
          <Form.Item
            name="codes"
            label="基金代码"
            rules={[{ required: true, message: '请输入基金代码' }]}
            tooltip="可输入多个 6 位代码，用逗号或空格分隔，最多 8 只"
          >
            <Input
              style={{ minWidth: 240, width: isMobile ? '100%' : 280 }}
              placeholder="如 161725, 000001, 110011"
            />
          </Form.Item>
          <Form.Item
            name="range"
            label="区间"
            initialValue={[dayjs().subtract(1, 'year'), dayjs()]}
            rules={[{ required: true, message: '请选择区间' }]}
          >
            <DatePicker.RangePicker style={{ width: isMobile ? '100%' : undefined }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" loading={loading} onClick={handleQuery} block={isMobile}>
              查询
            </Button>
          </Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          通过图表与表格多维展示基金净值走势、区间业绩指标与重仓持仓。数据来自公开网络、非官方，仅供学习参考。
        </Typography.Paragraph>
      </Card>

      {loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
            <div style={{ marginTop: 12, color: '#999' }}>加载基金数据中…</div>
          </div>
        </Card>
      )}

      {!loading && funds.length === 0 && (
        <Card>
          <Empty description="输入基金代码与区间后查询" />
        </Card>
      )}

      {!loading && funds.length > 0 && (
        <>
          <Card
            title="净值走势对比"
            extra={
              <Segmented
                size="small"
                value={normalized ? 'norm' : 'raw'}
                onChange={(v) => setNormalized(v === 'norm')}
                options={[
                  { label: '归一化(首日=100)', value: 'norm' },
                  { label: '单位净值', value: 'raw' },
                ]}
              />
            }
          >
            {dataFunds.length === 0 ? (
              <Empty description="无净值数据" />
            ) : (
              <Suspense fallback={<Spin />}>
                <FundNavChart funds={dataFunds} normalized={normalized} resolveName={resolve} />
              </Suspense>
            )}
          </Card>

          <Card title="区间业绩指标对比">
            {dataFunds.length === 0 ? (
              <Empty description="无净值数据" />
            ) : (
              <Table
                rowKey="key"
                dataSource={metricRows}
                columns={metricColumns}
                pagination={false}
                size="small"
                scroll={{ x: 'max-content' }}
              />
            )}
          </Card>

          {funds.map((f) => (
            <Card
              key={f.code}
              title={<FundCell code={f.code} name={resolve(f.code)} />}
              extra={f.type ? <Tag color="blue">{f.type}</Tag> : null}
            >
              {f.error && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={`部分数据获取失败：${f.error}`}
                />
              )}
              <Row gutter={[16, 12]}>
                <Col xs={12} md={6}>
                  <Statistic title="最新净值" value={f.metrics.endNav.toFixed(4)} />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic
                    title="区间收益率"
                    value={fmtPct(f.metrics.totalReturn * 100)}
                    valueStyle={{ color: pnlColor(f.metrics.totalReturn) }}
                  />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic
                    title="年化收益"
                    value={fmtPct(f.metrics.annualizedReturn * 100)}
                    valueStyle={{ color: pnlColor(f.metrics.annualizedReturn) }}
                  />
                </Col>
                <Col xs={12} md={6}>
                  <Tooltip title="回撤为下跌，按负值展示">
                    <Statistic
                      title="最大回撤"
                      value={fmtDrawdown(f.metrics.maxDrawdown)}
                      valueStyle={{ color: drawdownColor(f.metrics.maxDrawdown) }}
                    />
                  </Tooltip>
                </Col>
                <Col xs={12} md={6}>
                  <Tooltip
                    title={
                      f.metrics.maxDrawdownRecoveryDays !== undefined
                        ? `自谷底 ${f.metrics.maxDrawdownTroughDate} 起，经 ${f.metrics.maxDrawdownRecoveryDays} 个交易日于 ${f.metrics.maxDrawdownRecoveryDate} 回到峰值`
                        : f.metrics.maxDrawdownDaysSinceTrough !== undefined
                          ? `区间末仍未回到峰值，自谷底 ${f.metrics.maxDrawdownTroughDate} 起已持续 ${f.metrics.maxDrawdownDaysSinceTrough} 个交易日`
                          : '无回撤'
                    }
                  >
                    <Statistic
                      title="回撤修复天数"
                      value={
                        f.metrics.maxDrawdown <= 0
                          ? '—'
                          : f.metrics.maxDrawdownRecoveryDays !== undefined
                            ? `${f.metrics.maxDrawdownRecoveryDays} 天`
                            : `未修复（${f.metrics.maxDrawdownDaysSinceTrough ?? 0}天）`
                      }
                      valueStyle={
                        f.metrics.maxDrawdownRecoveryDays === undefined && f.metrics.maxDrawdown > 0
                          ? { color: '#cf1322' }
                          : undefined
                      }
                    />
                  </Tooltip>
                </Col>
                {f.metrics.maxDrawdownRecoveryDays === undefined &&
                  f.metrics.maxDrawdown > 0 &&
                  (f.metrics.recoveredMaxDrawdown ?? 0) > 0 && (
                    <Col xs={12} md={6}>
                      <Tooltip
                        title={`当前最大回撤尚未修复；历史上已修复的最深回撤为 ${fmtDrawdown(
                          f.metrics.recoveredMaxDrawdown ?? 0,
                        )}，自谷底 ${f.metrics.recoveredMaxDrawdownTroughDate} 起经 ${
                          f.metrics.recoveredMaxDrawdownRecoveryDays
                        } 个交易日于 ${f.metrics.recoveredMaxDrawdownRecoveryDate} 回到峰值`}
                      >
                        <Statistic
                          title="历史已修复最大回撤"
                          value={`${fmtDrawdown(f.metrics.recoveredMaxDrawdown ?? 0)} / ${
                            f.metrics.recoveredMaxDrawdownRecoveryDays
                          }天`}
                          valueStyle={{ color: drawdownColor(f.metrics.recoveredMaxDrawdown ?? 0) }}
                        />
                      </Tooltip>
                    </Col>
                  )}
              </Row>
              <div style={{ marginTop: 16 }}>
                <Typography.Text strong>
                  重仓持仓
                  {f.holdingsReportDate ? `（${f.holdingsReportDate}）` : ''}
                  {f.holdingsTotalWeight ? ` 合计 ${f.holdingsTotalWeight.toFixed(2)}%` : ''}
                </Typography.Text>
                {f.holdings.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无公开持仓数据"
                    style={{ marginTop: 8 }}
                  />
                ) : (
                  <Suspense fallback={<Spin />}>
                    <FundHoldingsChart holdings={f.holdings} />
                  </Suspense>
                )}
              </div>
            </Card>
          ))}
        </>
      )}
    </Space>
  );
}
