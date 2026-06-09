import { lazy, Suspense } from 'react';
import {
  Card,
  Form,
  Select,
  Input,
  DatePicker,
  Button,
  Space,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Empty,
  App,
  Alert,
  Typography,
  Spin,
  Tooltip,
  Tabs,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import { useStrategyStore } from '@/stores/strategyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { collectFundCodes, loadNavData, runBacktestInWorker } from '@/services/backtestService';
import { ComparisonPanel } from '@/components/ComparisonPanel';
import { FundCell } from '@/components/FundLabel';
import { useFundNames } from '@/hooks/useFundNames';
import { fmtMoney, fmtPct, pnlColor, fmtDrawdown, drawdownColor } from '@/utils/format';
import type { BacktestResult, BacktestTrade } from '@fund/core';

// ECharts 较重，按需懒加载（仅回测出结果时才加载该 chunk）
const BacktestChart = lazy(() =>
  import('@/components/BacktestChart').then((m) => ({ default: m.BacktestChart })),
);

export function BacktestPage() {
  const { sets, load } = useStrategyStore();
  const { settings } = useSettingsStore();

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Tabs
      defaultActiveKey="single"
      items={[
        { key: 'single', label: '单策略集回测', children: <SingleBacktest /> },
        {
          key: 'compare',
          label: '多策略集对比',
          children: <ComparisonPanel sets={sets} purchaseFeeRate={settings.defaultPurchaseFeeRate} />,
        },
      ]}
    />
  );
}

function SingleBacktest() {
  const { message } = App.useApp();
  const { sets, load } = useStrategyStore();
  const { settings } = useSettingsStore();
  const isMobile = useIsMobile();

  const [form] = Form.useForm();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  // 期初资金不再由用户输入，改为取回测结果（引擎自动推导所需资金），用于曲线"期初资金"参考线
  const initialCash = result?.metrics.initialCash ?? 0;

  useEffect(() => {
    load();
  }, [load]);

  // 名称解析（需求 4）：覆盖所有策略集涉及的标的代码
  const allCodes = useMemo(
    () => [...new Set(sets.flatMap((s) => collectFundCodes(s.strategies)))],
    [sets],
  );
  const { resolve } = useFundNames(allCodes);
  const resolveLabel = (code: string) => {
    const nm = resolve(code);
    return nm && nm !== code ? `${nm}（${code}）` : code;
  };

  const handleRun = async () => {
    const v = await form.validateFields();
    const set = sets.find((s) => s.id === v.setId);
    if (!set || set.strategies.length === 0) {
      message.warning('请选择含有策略的策略集');
      return;
    }
    const [start, end] = v.range as [Dayjs, Dayjs];
    const startStr = start.format('YYYY-MM-DD');
    const endStr = end.format('YYYY-MM-DD');
    const codes = collectFundCodes(set.strategies);

    // 基准解析（需求 2）：优先选中的策略集 > 输入的基金代码 > 默认首个标的
    const benchSet =
      v.benchmarkSetId && v.benchmarkSetId !== set.id
        ? sets.find((s) => s.id === v.benchmarkSetId && s.strategies.length > 0)
        : undefined;
    const benchFund = !benchSet ? (v.benchmarkFund as string | undefined)?.trim() : undefined;

    // 需要拉取净值的全部标的：主策略集 + 基准策略集 + 基准基金
    const loadCodes = new Set<string>(codes);
    if (benchSet) collectFundCodes(benchSet.strategies).forEach((c) => loadCodes.add(c));
    if (benchFund) loadCodes.add(benchFund);

    setRunning(true);
    setResult(null);
    try {
      const navData = await loadNavData([...loadCodes], startStr, endStr);
      const totalPoints = Object.values(navData).reduce((acc, p) => acc + p.length, 0);
      if (totalPoints === 0) {
        message.error('未获取到该区间的历史净值');
        return;
      }
      const res = await runBacktestInWorker({
        strategies: set.strategies,
        conflictPolicy: set.conflictPolicy,
        navData,
        start: startStr,
        end: endStr,
        purchaseFeeRate: settings.defaultPurchaseFeeRate,
        ...(benchSet
          ? {
              benchmarkStrategies: benchSet.strategies,
              benchmarkConflictPolicy: benchSet.conflictPolicy,
              benchmarkLabel: benchSet.name,
            }
          : { benchmarkFundCode: benchFund || codes[0] }),
      });
      setResult(res);
      message.success('回测完成');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '回测失败');
    } finally {
      setRunning(false);
    }
  };

  const tradeColumns = [
    { title: '日期', dataIndex: 'date', key: 'date' },
    {
      title: '方向',
      dataIndex: 'side',
      key: 'side',
      render: (s: string) => <Tag color={s === 'BUY' ? 'red' : 'green'}>{s === 'BUY' ? '买入' : '卖出'}</Tag>,
    },
    {
      title: '基金',
      dataIndex: 'fundCode',
      key: 'fundCode',
      render: (_: unknown, r: BacktestTrade) => <FundCell code={r.fundCode} name={resolve(r.fundCode)} />,
    },
    { title: '净值', dataIndex: 'nav', key: 'nav', render: (n: number) => n.toFixed(4) },
    { title: '金额', dataIndex: 'amount', key: 'amount', render: fmtMoney },
    { title: '份额', dataIndex: 'shares', key: 'shares', render: (s: number) => s.toFixed(2) },
    { title: '原因', dataIndex: 'reason', key: 'reason', ellipsis: true },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card title="策略回测">
        <Form form={form} layout={isMobile ? 'vertical' : 'inline'} style={{ rowGap: 12 }}>
          <Form.Item name="setId" label="策略集" rules={[{ required: true, message: '请选择' }]}>
            <Select
              style={{ minWidth: 180, width: isMobile ? '100%' : undefined }}
              placeholder="选择策略集"
              options={sets.map((s) => ({ label: `${s.name}（${s.strategies.length}）`, value: s.id }))}
              onChange={() => {
                form.setFieldValue('benchmarkSetId', undefined);
                form.setFieldValue('benchmarkFund', undefined);
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
                .filter((s) => s.id !== form.getFieldValue('setId') && s.strategies.length > 0)
                .map((s) => ({ label: `${s.name}（${s.strategies.length}）`, value: s.id }))}
              onChange={(val) => {
                if (val) form.setFieldValue('benchmarkFund', undefined);
              }}
            />
          </Form.Item>
          <Form.Item
            name="benchmarkFund"
            label="基准基金"
            tooltip="未选基准策略集时生效；留空则默认首个标的买入持有"
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
              运行回测
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {!result && !running && (
        <Card>
          <Empty description="配置策略集与区间后运行回测" />
        </Card>
      )}

      {result && (
        <>
          <Card title="回测指标">
            <Typography.Text type="secondary">资金</Typography.Text>
            <Row gutter={[16, 12]} style={{ marginTop: 8, marginBottom: 8 }}>
              <Col xs={12} md={6}>
                <Tooltip title="按策略买卖自动推导的期初所需资金（使期间可用现金不为负）">
                  <Statistic title="期初所需资金" value={fmtMoney(result.metrics.initialCash)} prefix="¥" />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Statistic title="累计买入" value={fmtMoney(result.metrics.totalBought)} prefix="¥" />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title="累计卖出回收" value={fmtMoney(result.metrics.totalSold)} prefix="¥" />
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="实际投入成本 = 累计买入 − 累计卖出回收，即真金白银净投入；去掉初始资金限制后作为累计收益率基准">
                  <Statistic title="实际投入成本" value={fmtMoney(result.metrics.netInvested)} prefix="¥" />
                </Tooltip>
              </Col>
            </Row>

            <Typography.Text type="secondary">期末状态</Typography.Text>
            <Row gutter={[16, 12]} style={{ marginTop: 8, marginBottom: 8 }}>
              <Col xs={12} md={6}>
                <Statistic title="期末总资产" value={fmtMoney(result.metrics.finalAssets)} prefix="¥" />
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="去掉初始资金限制后，可用现金可能为负，表示累计追加投入超过期初资金">
                  <Statistic title="期末可用现金" value={fmtMoney(result.metrics.finalCash)} prefix="¥" />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title="期末持有总额"
                  value={fmtMoney(result.metrics.finalHoldingValue)}
                  prefix="¥"
                />
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title="期末持有份额"
                  value={result.metrics.finalHoldingShares.toFixed(2)}
                />
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title="期末持仓成本"
                  value={fmtMoney(result.metrics.finalHoldingCost)}
                  prefix="¥"
                />
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="期末成本单价 = 期末持仓成本 / 期末持有份额">
                  <Statistic
                    title="期末成本单价"
                    value={result.metrics.finalCostPrice.toFixed(4)}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="期末实际单价 = 期末持有总额 / 期末持有份额（持仓加权市价）">
                  <Statistic
                    title="期末实际单价"
                    value={result.metrics.finalUnitNav.toFixed(4)}
                  />
                </Tooltip>
              </Col>
            </Row>

            <Typography.Text type="secondary">收益</Typography.Text>
            <Row gutter={[16, 12]} style={{ marginTop: 8, marginBottom: 8 }}>
              <Col xs={12} md={6}>
                <Statistic
                  title="期末总收益"
                  value={fmtMoney(result.metrics.totalProfit)}
                  prefix="¥"
                  valueStyle={{ color: pnlColor(result.metrics.totalProfit) }}
                />
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="累计收益率 = 期末总收益 / 实际投入成本（净投入），以真金白银投入为基准">
                  <Statistic
                    title="累计收益率"
                    value={fmtPct(result.metrics.cumulativeReturn * 100)}
                    valueStyle={{ color: pnlColor(result.metrics.cumulativeReturn) }}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="总收益率 = 期末总收益 / 期初可用资金（旧口径，受闲置现金影响）">
                  <Statistic
                    title="总收益率"
                    value={fmtPct(result.metrics.totalReturn * 100)}
                    valueStyle={{ color: pnlColor(result.metrics.totalReturn) }}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title="年化收益"
                  value={fmtPct(result.metrics.annualizedReturn * 100)}
                  valueStyle={{ color: pnlColor(result.metrics.annualizedReturn) }}
                />
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="期末持有收益 = 期末持有总额 − 期末持仓成本">
                  <Statistic
                    title="期末持有收益"
                    value={fmtMoney(result.metrics.holdingProfit)}
                    prefix="¥"
                    valueStyle={{ color: pnlColor(result.metrics.holdingProfit) }}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="期末持有收益率 = 期末持有收益 / 期末持仓成本（金额口径）">
                  <Statistic
                    title="期末持有收益率"
                    value={fmtPct(result.metrics.holdingProfitRate * 100)}
                    valueStyle={{ color: pnlColor(result.metrics.holdingProfitRate) }}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="时间加权持有收益，剔除现金与资金流入影响">
                  <Statistic
                    title="持有收益率(时间加权)"
                    value={fmtPct(result.metrics.holdingReturn * 100)}
                    valueStyle={{ color: pnlColor(result.metrics.holdingReturn) }}
                  />
                </Tooltip>
              </Col>
            </Row>

            <Typography.Text type="secondary">风险</Typography.Text>
            <Row gutter={[16, 12]} style={{ marginTop: 8, marginBottom: 8 }}>
              <Col xs={12} md={6}>
                <Tooltip title="基于总资产曲线（含闲置现金）；回撤为下跌，按负值展示">
                  <Statistic
                    title="总资产最大回撤"
                    value={fmtDrawdown(result.metrics.maxDrawdown)}
                    valueStyle={{ color: drawdownColor(result.metrics.maxDrawdown) }}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Tooltip
                  title={`时间加权，仅反映持仓本身回撤，不受闲置现金/定投资金流入稀释；回撤为下跌按负值展示${
                    result.metrics.maxDrawdownPeakDate
                      ? `；峰值 ${result.metrics.maxDrawdownPeakDate} → 谷底 ${result.metrics.maxDrawdownTroughDate}`
                      : ''
                  }`}
                >
                  <Statistic
                    title="持有最大回撤"
                    value={fmtDrawdown(result.metrics.holdingMaxDrawdown)}
                    valueStyle={{ color: drawdownColor(result.metrics.holdingMaxDrawdown) }}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Tooltip
                  title={
                    result.metrics.maxDrawdownRecoveryDays !== undefined
                      ? `自谷底 ${result.metrics.maxDrawdownTroughDate} 起，经 ${result.metrics.maxDrawdownRecoveryDays} 个交易日于 ${result.metrics.maxDrawdownRecoveryDate} 回到峰值`
                      : result.metrics.maxDrawdownDaysSinceTrough !== undefined
                        ? `期末仍未回到峰值，自谷底 ${result.metrics.maxDrawdownTroughDate} 起已持续 ${result.metrics.maxDrawdownDaysSinceTrough} 个交易日`
                        : '无回撤'
                  }
                >
                  <Statistic
                    title="回撤修复天数"
                    value={
                      result.metrics.holdingMaxDrawdown <= 0
                        ? '—'
                        : result.metrics.maxDrawdownRecoveryDays !== undefined
                          ? `${result.metrics.maxDrawdownRecoveryDays} 天`
                          : `未修复（${result.metrics.maxDrawdownDaysSinceTrough ?? 0}天）`
                    }
                    valueStyle={
                      result.metrics.maxDrawdownRecoveryDays === undefined &&
                      result.metrics.holdingMaxDrawdown > 0
                        ? { color: '#cf1322' }
                        : undefined
                    }
                  />
                </Tooltip>
              </Col>
              {result.metrics.maxDrawdownRecoveryDays === undefined &&
                result.metrics.holdingMaxDrawdown > 0 &&
                (result.metrics.recoveredMaxDrawdown ?? 0) > 0 && (
                  <Col xs={12} md={6}>
                    <Tooltip
                      title={`当前最大回撤尚未修复；历史上已修复的最深回撤为 ${fmtDrawdown(
                        result.metrics.recoveredMaxDrawdown ?? 0,
                      )}，自谷底 ${result.metrics.recoveredMaxDrawdownTroughDate} 起经 ${
                        result.metrics.recoveredMaxDrawdownRecoveryDays
                      } 个交易日于 ${result.metrics.recoveredMaxDrawdownRecoveryDate} 回到峰值`}
                    >
                      <Statistic
                        title="历史已修复最大回撤"
                        value={`${fmtDrawdown(result.metrics.recoveredMaxDrawdown ?? 0)} / ${
                          result.metrics.recoveredMaxDrawdownRecoveryDays
                        }天`}
                        valueStyle={{ color: drawdownColor(result.metrics.recoveredMaxDrawdown ?? 0) }}
                      />
                    </Tooltip>
                  </Col>
                )}
              <Col xs={12} md={6}>
                <Tooltip title="持有指数日收益的年化标准差">
                  <Statistic
                    title="年化波动率"
                    value={fmtPct(result.metrics.annualizedVolatility * 100)}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="盈利日占比 = 持有日收益>0 的天数 / 总天数">
                  <Statistic
                    title="盈利日占比"
                    value={fmtPct(result.metrics.winningDaysRatio * 100)}
                  />
                </Tooltip>
              </Col>
            </Row>

            <Typography.Text type="secondary">风险调整收益</Typography.Text>
            <Row gutter={[16, 12]} style={{ marginTop: 8, marginBottom: 8 }}>
              <Col xs={12} md={6}>
                <Tooltip title="夏普比率 = (持有年化收益 − 无风险利率) / 年化波动率，越高越好">
                  <Statistic
                    title="夏普比率"
                    value={result.metrics.sharpeRatio.toFixed(2)}
                    valueStyle={{ color: pnlColor(result.metrics.sharpeRatio) }}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="索提诺比率 = 超额收益 / 下行波动率，仅惩罚负收益">
                  <Statistic
                    title="索提诺比率"
                    value={result.metrics.sortinoRatio.toFixed(2)}
                    valueStyle={{ color: pnlColor(result.metrics.sortinoRatio) }}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="卡玛比率 = 持有年化收益 / 持有最大回撤">
                  <Statistic
                    title="卡玛比率"
                    value={result.metrics.calmarRatio.toFixed(2)}
                    valueStyle={{ color: pnlColor(result.metrics.calmarRatio) }}
                  />
                </Tooltip>
              </Col>
              <Col xs={12} md={6}>
                <Tooltip title="基于时间加权持有指数的年化收益">
                  <Statistic
                    title="持有年化收益"
                    value={fmtPct(result.metrics.holdingAnnualizedReturn * 100)}
                    valueStyle={{ color: pnlColor(result.metrics.holdingAnnualizedReturn) }}
                  />
                </Tooltip>
              </Col>
            </Row>

            <Typography.Text type="secondary">交易</Typography.Text>
            <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
              <Col xs={12} md={6}>
                <Statistic
                  title="交易次数"
                  value={`${result.metrics.tradeCount}（买${result.metrics.buyCount}/卖${result.metrics.sellCount}）`}
                />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title="累计费用" value={fmtMoney(result.metrics.totalFee)} prefix="¥" />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title="回测交易日" value={result.metrics.tradingDays} suffix="天" />
              </Col>
            </Row>
            {result.benchmark && (
              <Alert
                style={{ marginTop: 12 }}
                type="info"
                showIcon
                message={`基准（${
                  result.benchmark.kind === 'STRATEGY'
                    ? `策略：${result.benchmark.label ?? resolveLabel(result.benchmark.fundCode ?? '')}`
                    : `${resolveLabel(result.benchmark.fundCode ?? '')} 买入持有`
                }）：总收益 ${fmtPct(
                  result.benchmark.totalReturn * 100,
                )} ｜ 年化 ${fmtPct(result.benchmark.annualizedReturn * 100)} ｜ 最大回撤 ${fmtDrawdown(
                  result.benchmark.maxDrawdown,
                )} ｜ 策略相对基准超额 ${fmtPct(
                  (result.metrics.totalReturn - result.benchmark.totalReturn) * 100,
                )}`}
              />
            )}
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
              回测基于历史净值模拟，采用统一费率近似，未计入分红再投、申赎确认延迟、滑点等因素。
              历史表现不代表未来收益，结果仅供学习参考，不构成投资建议。
            </Typography.Paragraph>
          </Card>

          <Card title="净值曲线">
            <Suspense fallback={<Spin />}>
              <BacktestChart result={result} initialCash={initialCash} />
            </Suspense>
          </Card>

          <Card title={`操作流水（${result.trades.length}）`}>
            {result.trades.length === 0 ? (
              <Empty description="区间内无触发交易" />
            ) : (
              <Table
                rowKey={(r: BacktestTrade) => `${r.date}-${r.fundCode}-${r.side}-${r.shares}`}
                dataSource={result.trades}
                columns={tradeColumns}
                size="small"
                pagination={{ pageSize: 15 }}
                scroll={{ x: 'max-content' }}
              />
            )}
          </Card>
        </>
      )}
    </Space>
  );
}
