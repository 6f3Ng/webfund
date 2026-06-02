import { useEffect, useState, useCallback } from 'react';
import { Modal, Table, Tag, Empty, Alert, Typography, Spin, App, Space, Button } from 'antd';
import {
  DEFAULT_CONFLICT_POLICY,
  type LivePreviewResult,
  type Portfolio,
  type Strategy,
  type StrategyAction,
} from '@fund/core';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useValuationStore } from '@/stores/valuationStore';
import { previewPortfolioExecution, describeAction } from '@/services/strategyExecutionService';
import { useIsMobile } from '@/hooks/useIsMobile';
import { fmtMoney } from '@/utils/format';

const TEMPLATE_LABEL: Record<string, string> = {
  DCA: '定投',
  BASE_POSITION: '底仓',
  SMART_DCA_CHANGE: '智能定投·涨跌幅',
  SMART_DCA_MA: '智能定投·均线',
  VALUE_AVERAGING: '目标市值法',
  THRESHOLD_BUY: '阈值买入',
  SMART_THRESHOLD_BUY_CHANGE: '智能阈值买入·涨跌幅',
  THRESHOLD_SELL: '阈值卖出',
  SMART_THRESHOLD_SELL_CHANGE: '智能阈值卖出·涨跌幅',
  TAKE_PROFIT: '止盈',
  SMART_TAKE_PROFIT: '智能止盈',
  STOP_LOSS: '止损',
  GRID: '网格',
};

interface StrategyExecModalProps {
  open: boolean;
  portfolio: Portfolio;
  /** 组合配置的全部策略（来自其引用的所有策略集，已合并） */
  strategies: Strategy[];
  /** 各标的展示净值（用于卖出金额换算份额展示） */
  navByCode: Record<string, number>;
  onClose: () => void;
}

export function StrategyExecModal({
  open,
  portfolio,
  strategies,
  navByCode,
  onClose,
}: StrategyExecModalProps) {
  const { message } = App.useApp();
  const { quotes } = useValuationStore();
  const { current, executeActions, setBaseStrategyBuilt } = usePortfolioStore();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<LivePreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 重新求值预览（始终读取最新的当前组合，反映底仓重置等设置变化）
  const runPreview = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setPreview(null);
    const pf = current() ?? portfolio;
    previewPortfolioExecution(pf, strategies, DEFAULT_CONFLICT_POLICY, quotes)
      .then((res) => {
        if (alive) setPreview(res);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : '预览失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [current, portfolio, strategies, quotes]);

  useEffect(() => {
    if (!open) return;
    return runPreview();
  }, [open, runPreview]);

  // 切换某底仓策略的「已建仓」标记后重新预览（可逆，避免误触无法回退）
  const handleToggleBase = (strategyId: string, built: boolean) => {
    setBaseStrategyBuilt(strategyId, built);
    runPreview();
  };

  const handleExecute = async () => {
    if (!preview || preview.merged.length === 0) return;
    setExecuting(true);
    try {
      // 本次触发的底仓策略 id（执行后记录，避免重复建仓）
      const baseIds = preview.diagnostics
        .filter((d) => d.templateType === 'BASE_POSITION' && d.triggered)
        .map((d) => d.strategyId);
      const n = await executeActions(preview.merged, navByCode, baseIds);
      message.success(`已提交 ${n} 笔策略订单`);
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '执行失败');
    } finally {
      setExecuting(false);
    }
  };

  const diagColumns = [
    { title: '策略', dataIndex: 'strategyName', key: 'name' },
    {
      title: '类型',
      dataIndex: 'templateType',
      key: 'type',
      render: (t: string) => <Tag>{TEMPLATE_LABEL[t] ?? t}</Tag>,
    },
    { title: '标的', dataIndex: 'fundCode', key: 'fundCode' },
    {
      title: '求值结果',
      key: 'result',
      render: (_: unknown, r: LivePreviewResult['diagnostics'][number]) => {
        const isBase = r.templateType === 'BASE_POSITION';
        if (r.triggered) {
          return (
            <Space direction="vertical" size={2}>
              {r.actions.map((a, i) => (
                <span key={i} style={{ color: a.side === 'BUY' ? '#cf1322' : '#3f8600' }}>
                  {describeAction(a, navByCode[a.fundCode])}
                </span>
              ))}
              {/* 底仓已解锁将再次建仓：提供「标记为已建仓」可逆撤销，避免误触 */}
              {isBase && (
                <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => handleToggleBase(r.strategyId, true)}>
                  撤销（标记为已建仓）
                </Button>
              )}
            </Space>
          );
        }
        // 底仓已建仓：提供「再次建仓」入口（可逆，再次点击对侧按钮可撤销）
        if (r.baseAlreadyBuilt) {
          return (
            <Space size={8} wrap>
              <span style={{ color: '#999' }}>底仓已建仓</span>
              <Button size="small" onClick={() => handleToggleBase(r.strategyId, false)}>
                再次建仓
              </Button>
            </Space>
          );
        }
        return <span style={{ color: '#999' }}>未触发</span>;
      },
    },
  ];

  const mergedColumns = [
    {
      title: '方向',
      dataIndex: 'side',
      key: 'side',
      render: (s: string) => <Tag color={s === 'BUY' ? 'red' : 'green'}>{s === 'BUY' ? '买入' : '卖出'}</Tag>,
    },
    { title: '标的', dataIndex: 'fundCode', key: 'fundCode' },
    {
      title: '执行内容',
      key: 'detail',
      render: (_: unknown, a: StrategyAction) => describeAction(a, navByCode[a.fundCode]),
    },
    { title: '原因', dataIndex: 'reason', key: 'reason', ellipsis: true },
  ];

  const hasActions = (preview?.merged.length ?? 0) > 0;

  return (
    <Modal
      title="策略执行预览"
      open={open}
      onCancel={onClose}
      onOk={handleExecute}
      okText={hasActions ? '确认执行' : '无可执行动作'}
      okButtonProps={{ disabled: !hasActions || loading, loading: executing }}
      cancelText="取消"
      width={760}
      style={{ maxWidth: '96vw', top: isMobile ? 16 : undefined }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
          <div style={{ marginTop: 12, color: '#999' }}>按当前估值与持仓求值中…</div>
        </div>
      ) : error ? (
        <Alert type="error" showIcon message={error} />
      ) : !preview ? (
        <Empty description="暂无预览" />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="按持仓页当前估值与现有持仓求值。确认执行将生成待确认订单：T 日按收盘净值成交，份额于确认日（普通 T+1，QDII/港基/FOF 等更久）确认到账，确认前保持待确认。"
          />

          <div>
            <Typography.Text strong>各策略求值</Typography.Text>
            <Table
              style={{ marginTop: 8 }}
              rowKey="strategyId"
              size="small"
              pagination={false}
              dataSource={preview.diagnostics}
              columns={diagColumns}
              scroll={{ x: 'max-content' }}
            />
          </div>

          <div>
            <Typography.Text strong>归并后执行动作（先卖后买）</Typography.Text>
            {hasActions ? (
              <Table
                style={{ marginTop: 8 }}
                rowKey={(a: StrategyAction) => `${a.strategyId}-${a.fundCode}-${a.side}`}
                size="small"
                pagination={false}
                dataSource={preview.merged}
                columns={mergedColumns}
                scroll={{ x: 'max-content' }}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="当前无策略触发，无需执行"
                style={{ marginTop: 8 }}
              />
            )}
          </div>

          <Typography.Text type="secondary">
            当前可用现金 ¥{fmtMoney(portfolio.cash)}；买入金额以可用现金为上限，卖出份额以可卖份额为上限。
          </Typography.Text>
        </Space>
      )}
    </Modal>
  );
}
