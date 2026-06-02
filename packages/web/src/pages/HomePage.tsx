import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Space,
  Table,
  Empty,
  Tag,
  Select,
  Tooltip,
  App,
  Alert,
  Typography,
} from 'antd';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';import {
  snapshotPortfolio,
  type PriceMap,
  type Position,
  type Strategy,
  VALUATION_SOURCES,
  type ValuationSourceId,
} from '@fund/core';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useValuationStore } from '@/stores/valuationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useStrategyStore } from '@/stores/strategyStore';
import { TradeModal, type TradeType } from '@/components/TradeModal';
import { StrategyExecModal } from '@/components/StrategyExecModal';
import { HoldingsColumnSettings } from '@/components/HoldingsColumnSettings';
import { PendingOrdersCard } from '@/components/PendingOrdersCard';
import { TransactionsCard } from '@/components/TransactionsCard';
import { fmtMoney, fmtPct, pnlColor } from '@/utils/format';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getCachedFundName } from '@/services/fundInfoService';
import {
  resolveDisplayName,
  sortByName,
  sortByValue,
  columnValueGetters,
  type HoldingsSortContext,
} from '@/utils/holdings';
import {
  loadColumnPrefs,
  saveColumnPrefs,
  visibleOrderedKeys,
  type HoldingsColumnKey,
  type HoldingsColumnPrefs,
} from '@/utils/holdingsColumns';

export function HomePage() {
  const { message } = App.useApp();
  const { portfolios, currentId, current, setCurrent, load, settle, setStrategySets } =
    usePortfolioStore();
  const { quotes, names: quoteNames, estimating, refresh, loading, lastUpdated, error: valuationError } =
    useValuationStore();
  const { settings, setSource } = useSettingsStore();
  const { sets, load: loadStrategySets } = useStrategyStore();
  const isMobile = useIsMobile();

  const [modal, setModal] = useState<{ open: boolean; type: TradeType; preset?: string }>({
    open: false,
    type: 'BUY',
  });
  const [execOpen, setExecOpen] = useState(false);

  // 持仓明细列偏好（顺序 + 显隐），持久化到 localStorage
  const [columnPrefs, setColumnPrefs] = useState<HoldingsColumnPrefs>(() => loadColumnPrefs());
  const updateColumnPrefs = (next: HoldingsColumnPrefs) => {
    setColumnPrefs(next);
    saveColumnPrefs(next);
  };

  const pf = current();

  useEffect(() => {
    load();
    loadStrategySets();
  }, [load, loadStrategySets]);

  // 切换/加载组合时结算待确认订单并刷新行情（行情刷新内部已成对预取基金名称）
  const codes = useMemo(() => pf?.positions.map((p) => p.fundCode) ?? [], [pf]);
  useEffect(() => {
    if (!pf) return;
    settle();
    if (codes.length > 0) refresh(codes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, codes.length]);

  const priceMap: PriceMap = useMemo(() => {
    const m: PriceMap = {};
    for (const code of codes) {
      const q = quotes[code];
      if (!q) continue;
      // 无有效行情（数据源失败返回 0）时跳过，让 core 按成本回退（盈亏 0）
      if (q.nav > 0) m[code] = { nav: q.nav, prevNav: q.prevNav };
    }
    return m;
  }, [codes, quotes]);

  const snap = useMemo(() => (pf ? snapshotPortfolio(pf, priceMap) : null), [pf, priceMap]);

  // 组合配置的策略集 → 合并后的策略列表（仅来自本集合引用的策略集，互不影响）
  const configuredSetIds = pf?.settings.strategySetIds ?? [];
  const appliedStrategies: Strategy[] = useMemo(() => {
    const ids = new Set(configuredSetIds);
    return sets.filter((s) => ids.has(s.id)).flatMap((s) => s.strategies);
  }, [sets, configuredSetIds.join(',')]);

  // 各标的展示净值（与持仓页同源），供策略执行的卖出金额换算份额
  const navByCode = useMemo(() => {
    const m: Record<string, number> = {};
    for (const code of Object.keys(quotes)) {
      const q = quotes[code];
      if (q && q.nav > 0) m[code] = q.nav;
    }
    return m;
  }, [quotes]);

  if (!pf) {
    return (
      <Card>
        <Empty description="还没有持仓集合">
          <Button type="primary" href="/portfolios">
            去创建持仓集合
          </Button>
        </Empty>
      </Card>
    );
  }

  const navColTitle = estimating ? '估值' : '净值';
  const growthColTitle = estimating ? '估算涨跌' : '当日涨跌';

  // 排序上下文与名称解析：与单元格渲染同源（需求 5.3）。名称来自行情刷新成对解析的 store。
  const sortCtx: HoldingsSortContext = { quotes, snap };
  const resolveName = (code: string) => resolveDisplayName(code, quoteNames, getCachedFundName);

  const columnsByKey: Record<HoldingsColumnKey, Record<string, unknown>> = {
    fund: {
      title: '基金',
      key: 'fund',
      sorter: sortByName((r: Position) => resolveName(r.fundCode)),
      render: (_: unknown, r: Position) => (
        <Space direction="vertical" size={0}>
          <span>{resolveName(r.fundCode)}</span>
          <span style={{ fontSize: 12, color: '#999' }}>{r.fundCode}</span>
        </Space>
      ),
    },
    nav: {
      title: navColTitle,
      key: 'nav',
      sorter: sortByValue((r: Position) => columnValueGetters.nav(r, sortCtx)),
      render: (_: unknown, r: Position) => {
        const q = quotes[r.fundCode];
        return q && q.nav > 0 ? q.nav.toFixed(4) : '-';
      },
    },
    growth: {
      title: growthColTitle,
      key: 'growth',
      sorter: sortByValue((r: Position) => columnValueGetters.growth(r, sortCtx)),
      render: (_: unknown, r: Position) => {
        const q = quotes[r.fundCode];
        if (!q || q.nav <= 0) return '-';
        return <span style={{ color: pnlColor(q.growthPct) }}>{fmtPct(q.growthPct)}</span>;
      },
    },
    dayProfit: {
      title: estimating ? '估算收益' : '当日收益',
      key: 'dayProfit',
      sorter: sortByValue((r: Position) => columnValueGetters.dayProfit(r, sortCtx)),
      render: (_: unknown, r: Position) => {
        const sp = snap?.positions.find((p) => p.fundCode === r.fundCode);
        const q = quotes[r.fundCode];
        if (!sp || !q || q.nav <= 0) return '-';
        return <span style={{ color: pnlColor(sp.dayProfit) }}>{fmtMoney(sp.dayProfit)}</span>;
      },
    },
    shares: {
      title: '持有份额',
      dataIndex: 'shares',
      key: 'shares',
      sorter: sortByValue((r: Position) => columnValueGetters.shares(r, sortCtx)),
      render: (s: number) => s.toFixed(2),
    },
    availableShares: {
      title: '可卖份额',
      dataIndex: 'availableShares',
      key: 'availableShares',
      sorter: sortByValue((r: Position) => columnValueGetters.availableShares(r, sortCtx)),
      render: (s: number) => s.toFixed(2),
    },
    costPrice: {
      title: '成本单价',
      key: 'costPrice',
      sorter: sortByValue((r: Position) => columnValueGetters.costPrice(r, sortCtx)),
      render: (_: unknown, r: Position) => (r.shares > 0 ? (r.cost / r.shares).toFixed(4) : '-'),
    },
    cost: {
      title: '成本',
      dataIndex: 'cost',
      key: 'cost',
      sorter: sortByValue((r: Position) => columnValueGetters.cost(r, sortCtx)),
      render: fmtMoney,
    },
    mv: {
      title: '市值',
      key: 'mv',
      sorter: sortByValue((r: Position) => columnValueGetters.mv(r, sortCtx)),
      render: (_: unknown, r: Position) => {
        const sp = snap?.positions.find((p) => p.fundCode === r.fundCode);
        return sp ? fmtMoney(sp.marketValue) : '-';
      },
    },
    profit: {
      title: '收益',
      key: 'profit',
      sorter: sortByValue((r: Position) => columnValueGetters.profit(r, sortCtx)),
      render: (_: unknown, r: Position) => {
        const sp = snap?.positions.find((p) => p.fundCode === r.fundCode);
        if (!sp) return '-';
        return (
          <span style={{ color: pnlColor(sp.profit) }}>
            {fmtMoney(sp.profit)}（{fmtPct(sp.profitRate * 100)}）
          </span>
        );
      },
    },
    action: {
      title: '操作',
      key: 'action',
      render: (_: unknown, r: Position) => (
        <Space>
          <Button size="small" onClick={() => setModal({ open: true, type: 'SELL', preset: r.fundCode })}>
            卖出
          </Button>
          <Button
            size="small"
            onClick={() => setModal({ open: true, type: 'CONVERT', preset: r.fundCode })}
          >
            转换
          </Button>
        </Space>
      ),
    },
  };

  // 按用户偏好（顺序 + 显隐）组装最终列；当日收益默认紧随当日涨跌右侧
  const columns = visibleOrderedKeys(columnPrefs).map((k) => columnsByKey[k]);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space size="large" wrap>
              <Select
                value={currentId ?? undefined}
                style={{ minWidth: 180 }}
                onChange={setCurrent}
                options={portfolios.map((p) => ({ label: p.name, value: p.id }))}
              />
              <Statistic title="总资产" value={snap ? fmtMoney(snap.totalAssets) : '-'} prefix="¥" />
              <Statistic
                title="总收益"
                value={snap ? fmtMoney(snap.totalProfit) : '-'}
                valueStyle={{ color: pnlColor(snap?.totalProfit ?? 0) }}
                prefix="¥"
              />
              <Statistic
                title="收益率"
                value={snap ? fmtPct(snap.totalProfitRate * 100) : '-'}
                valueStyle={{ color: pnlColor(snap?.totalProfitRate ?? 0) }}
              />
              <Statistic title="可用现金" value={fmtMoney(pf.cash)} prefix="¥" />
              <Statistic
                title="当日盈亏"
                value={snap ? fmtMoney(snap.dayProfit) : '-'}
                valueStyle={{ color: pnlColor(snap?.dayProfit ?? 0) }}
                prefix="¥"
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <Card
        title="持仓明细"
        extra={
          <Space wrap>
            <Tag color={estimating ? 'processing' : 'default'}>
              {estimating ? '盘中估值' : '已公布净值'}
            </Tag>
            <span>数据源：</span>
            <Tooltip title={estimating ? '' : '非交易时段展示已公布净值，数据源仅在交易时段影响估值'}>
              <Select
                size="small"
                value={settings.defaultValuationSource}
                style={{ width: 130 }}
                onChange={(v) => {
                  setSource(v as ValuationSourceId);
                  if (codes.length) refresh(codes, v as ValuationSourceId);
                }}
                options={VALUATION_SOURCES.map((s) => ({
                  label: s.name,
                  value: s.id,
                }))}
              />
            </Tooltip>
            <Tooltip title={lastUpdated ? `更新于 ${new Date(lastUpdated).toLocaleTimeString()}` : ''}>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={() => (codes.length ? refresh(codes) : message.info('暂无持仓'))}
              >
                刷新
              </Button>
            </Tooltip>
            <HoldingsColumnSettings prefs={columnPrefs} onChange={updateColumnPrefs} />
            <Button type="primary" size="small" onClick={() => setModal({ open: true, type: 'BUY' })}>
              买入
            </Button>
          </Space>
        }
      >
        {valuationError && (
          <Alert
            type="warning"
            showIcon
            closable
            style={{ marginBottom: 12 }}
            message={`行情获取失败：${valuationError}（可切换数据源或稍后重试）`}
          />
        )}
        {pf.positions.length === 0 ? (
          <Empty description="暂无持仓，点击右上角买入" />
        ) : (
          <Table
            rowKey="fundCode"
            dataSource={pf.positions}
            columns={columns}
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
          />
        )}
        {estimating && quotes[codes[0]]?.confidence !== undefined && (
          <div style={{ marginTop: 8 }}>
            <Tag color="orange">
              自建估算覆盖率参考：{((quotes[codes[0]].confidence ?? 0) * 100).toFixed(1)}%
            </Tag>
          </div>
        )}
      </Card>

      <Card
        title="策略执行"
        extra={
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            disabled={appliedStrategies.length === 0}
            onClick={() => setExecOpen(true)}
          >
            预览执行
          </Button>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Space wrap align="center">
            <span>配置策略集：</span>
            <Select
              mode="multiple"
              allowClear
              placeholder={sets.length === 0 ? '请先在「策略」页创建策略集' : '选择应用于本集合的策略集'}
              style={{ minWidth: isMobile ? '100%' : 320 }}
              value={configuredSetIds}
              onChange={(ids) => setStrategySets(pf.id, ids)}
              options={sets.map((s) => ({ label: `${s.name}（${s.strategies.length}）`, value: s.id }))}
              notFoundContent="暂无策略集"
            />
          </Space>
          {appliedStrategies.length > 0 ? (
            <Tag color="blue">
              已配置 {configuredSetIds.length} 个策略集，共 {appliedStrategies.length} 条策略
            </Tag>
          ) : (
            <Typography.Text type="secondary">
              选择策略集后，点击「预览执行」可按当前估值与持仓推算买卖动作（多个集合策略互不影响）。
            </Typography.Text>
          )}
        </Space>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <PendingOrdersCard portfolio={pf} />
        </Col>
        <Col xs={24} lg={12}>
          <TransactionsCard portfolio={pf} />
        </Col>
      </Row>

      <TradeModal
        open={modal.open}
        type={modal.type}
        positions={pf.positions}
        presetFundCode={modal.preset}
        onClose={() => setModal({ ...modal, open: false })}
      />

      <StrategyExecModal
        open={execOpen}
        portfolio={pf}
        strategies={appliedStrategies}
        navByCode={navByCode}
        onClose={() => setExecOpen(false)}
      />
    </Space>
  );
}
