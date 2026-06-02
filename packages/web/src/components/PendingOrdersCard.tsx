import { Card, Table, Tag, Button, Empty, App, Tooltip } from 'antd';
import { isOrderCancellable, type Order, type Portfolio } from '@fund/core';
import { usePortfolioStore } from '@/stores/portfolioStore';

const TYPE_LABEL: Record<string, string> = { BUY: '买入', SELL: '卖出', CONVERT: '转换' };

/** 当前墙钟时间 'YYYY-MM-DDTHH:mm'（与 core 撤单判定口径一致） */
function nowIso(): string {
  return new Date().toISOString().slice(0, 16);
}

export function PendingOrdersCard({ portfolio }: { portfolio: Portfolio }) {
  const { message } = App.useApp();
  const { cancel, settle } = usePortfolioStore();
  const now = nowIso();

  const columns = [
    { title: '类型', dataIndex: 'type', key: 'type', render: (t: string) => <Tag>{TYPE_LABEL[t]}</Tag> },
    {
      title: '基金',
      key: 'fund',
      render: (_: unknown, r: Order) => (r.targetFundCode ? `${r.fundCode}→${r.targetFundCode}` : r.fundCode),
    },
    {
      title: '金额/份额',
      key: 'amt',
      render: (_: unknown, r: Order) => (r.amount ? `¥${r.amount}` : `${r.shares} 份`),
    },
    { title: '确认日', dataIndex: 'confirmDate', key: 'confirmDate' },
    {
      title: '份额确认日',
      key: 'shareConfirmDate',
      render: (_: unknown, r: Order) => r.shareConfirmDate ?? r.confirmDate,
    },
    {
      title: '操作',
      key: 'op',
      render: (_: unknown, r: Order) => {
        const cancellable = isOrderCancellable(r, now);
        const btn = (
          <Button
            size="small"
            danger
            disabled={!cancellable}
            onClick={() => {
              try {
                cancel(r.id);
                message.success('已撤单');
              } catch (e) {
                message.error(e instanceof Error ? e.message : '撤单失败');
              }
            }}
          >
            撤单
          </Button>
        );
        return cancellable ? (
          btn
        ) : (
          <Tooltip title="已过确认截止时点（确认日 15:00），按场外基金规则不可撤单">
            <span>{btn}</span>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <Card
      title={`待确认订单（${portfolio.pendingOrders.length}）`}
      size="small"
      extra={
        <Button size="small" onClick={() => settle()}>
          结算检查
        </Button>
      }
    >
      {portfolio.pendingOrders.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无待确认订单" />
      ) : (
        <Table
          rowKey="id"
          dataSource={portfolio.pendingOrders}
          columns={columns}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      )}
    </Card>
  );
}
