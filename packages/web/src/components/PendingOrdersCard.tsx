import { Card, Table, Tag, Button, Empty, App } from 'antd';
import type { Order, Portfolio } from '@fund/core';
import { usePortfolioStore } from '@/stores/portfolioStore';

const TYPE_LABEL: Record<string, string> = { BUY: '买入', SELL: '卖出', CONVERT: '转换' };

export function PendingOrdersCard({ portfolio }: { portfolio: Portfolio }) {
  const { message } = App.useApp();
  const { cancel, settle } = usePortfolioStore();

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
      title: '操作',
      key: 'op',
      render: (_: unknown, r: Order) => (
        <Button
          size="small"
          danger
          onClick={() => {
            cancel(r.id);
            message.success('已撤单');
          }}
        >
          撤单
        </Button>
      ),
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
        />
      )}
    </Card>
  );
}
