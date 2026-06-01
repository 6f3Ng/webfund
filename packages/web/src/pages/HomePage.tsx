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
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  snapshotPortfolio,
  type PriceMap,
  type Position,
  VALUATION_SOURCES,
  type ValuationSourceId,
} from '@fund/core';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useValuationStore } from '@/stores/valuationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { TradeModal, type TradeType } from '@/components/TradeModal';
import { PendingOrdersCard } from '@/components/PendingOrdersCard';
import { TransactionsCard } from '@/components/TransactionsCard';
import { fmtMoney, fmtPct, pnlColor } from '@/utils/format';
import { getCachedFundName, prefetchFundInfo } from '@/services/fundInfoService';
import {
  resolveDisplayName,
  sortByName,
  sortByValue,
  columnValueGetters,
  type HoldingsSortContext,
} from '@/utils/holdings';

export function HomePage() {
  const { message } = App.useApp();
  const { portfolios, currentId, current, setCurrent, load, settle } = usePortfolioStore();
  const { quotes, estimating, refresh, loading, lastUpdated, error: valuationError } =
    useValuationStore();
  const { settings, setSource } = useSettingsStore();

  const [modal, setModal] = useState<{ open: boolean; type: TradeType; preset?: string }>({
    open: false,
    type: 'BUY',
  });

  // 展示层本地名称表：预取回填后触发重渲染（名称属于展示层关注点，不进领域 store）
  const [names, setNames] = useState<Record<string, string>>({});

  const pf = current();

  useEffect(() => {
    load();
  }, [load]);

  // 切换/加载组合时结算待确认订单并刷新行情
  const codes = useMemo(() => pf?.positions.map((p) => p.fundCode) ?? [], [pf]);
  useEffect(() => {
    if (!pf) return;
    settle();
    if (codes.length > 0) refresh(codes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, codes.length]);

  // 预取未缓存的基金名称并回填本地名称表，触发重渲染（需求 4.5）
  useEffect(() => {
    let alive = true;
    for (const code of codes) {
      const cached = getCachedFundName(code);
      if (cached) {
        setNames((m) => (m[code] ? m : { ...m, [code]: cached }));
        continue;
      }
      void prefetchFundInfo(code).then((info) => {
        if (alive) setNames((m) => ({ ...m, [code]: info.name }));
      });
    }
    return () => {
      alive = false;
    };
  }, [codes]);

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

  // 排序上下文与名称解析：与单元格渲染同源（需求 5.3）
  const sortCtx: HoldingsSortContext = { quotes, snap };
  const resolveName = (code: string) => resolveDisplayName(code, names, getCachedFundName);

  const columns = [
    {
      title: '基金',
      key: 'fund',
      sorter: sortByName((r) => resolveName(r.fundCode)),
      render: (_: unknown, r: Position) => (
        <Space direction="vertical" size={0}>
          <span>{resolveName(r.fundCode)}</span>
          <span style={{ fontSize: 12, color: '#999' }}>{r.fundCode}</span>
        </Space>
      ),
    },
    {
      title: navColTitle,
      key: 'nav',
      sorter: sortByValue((r) => columnValueGetters.nav(r, sortCtx)),
      render: (_: unknown, r: Position) => {
        const q = quotes[r.fundCode];
        return q && q.nav > 0 ? q.nav.toFixed(4) : '-';
      },
    },
    {
      title: growthColTitle,
      key: 'growth',
      sorter: sortByValue((r) => columnValueGetters.growth(r, sortCtx)),
      render: (_: unknown, r: Position) => {
        const q = quotes[r.fundCode];
        if (!q || q.nav <= 0) return '-';
        return <span style={{ color: pnlColor(q.growthPct) }}>{fmtPct(q.growthPct)}</span>;
      },
    },
    {
      title: '持有份额',
      dataIndex: 'shares',
      key: 'shares',
      sorter: sortByValue((r) => columnValueGetters.shares(r, sortCtx)),
      render: (s: number) => s.toFixed(2),
    },
    {
      title: '可卖份额',
      dataIndex: 'availableShares',
      key: 'availableShares',
      sorter: sortByValue((r) => columnValueGetters.availableShares(r, sortCtx)),
      render: (s: number) => s.toFixed(2),
    },
    {
      title: '成本单价',
      key: 'costPrice',
      sorter: sortByValue((r) => columnValueGetters.costPrice(r, sortCtx)),
      render: (_: unknown, r: Position) => (r.shares > 0 ? (r.cost / r.shares).toFixed(4) : '-'),
    },
    {
      title: '成本',
      dataIndex: 'cost',
      key: 'cost',
      sorter: sortByValue((r) => columnValueGetters.cost(r, sortCtx)),
      render: fmtMoney,
    },
    {
      title: '市值',
      key: 'mv',
      sorter: sortByValue((r) => columnValueGetters.mv(r, sortCtx)),
      render: (_: unknown, r: Position) => {
        const sp = snap?.positions.find((p) => p.fundCode === r.fundCode);
        return sp ? fmtMoney(sp.marketValue) : '-';
      },
    },
    {
      title: '收益',
      key: 'profit',
      sorter: sortByValue((r) => columnValueGetters.profit(r, sortCtx)),
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
    {
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
  ];

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
    </Space>
  );
}
