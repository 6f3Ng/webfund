import { Card, Table, Tag, Empty } from 'antd';
import type { Portfolio, Transaction } from '@fund/core';
import { fmtMoney } from '@/utils/format';

const TYPE_LABEL: Record<string, string> = {
  BUY: '买入',
  SELL: '卖出',
  CONVERT: '转换',
  DIVIDEND: '分红',
};

export function TransactionsCard({ portfolio }: { portfolio: Portfolio }) {
  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date' },
    { title: '类型', dataIndex: 'type', key: 'type', render: (t: string) => <Tag>{TYPE_LABEL[t]}</Tag> },
    {
      title: '基金',
      key: 'fund',
      render: (_: unknown, r: Transaction) =>
        r.targetFundCode ? `${r.fundCode}→${r.targetFundCode}` : r.fundCode,
    },
    { title: '净值', dataIndex: 'nav', key: 'nav', render: (n: number) => n.toFixed(4) },
    { title: '金额', dataIndex: 'amount', key: 'amount', render: fmtMoney },
    { title: '份额', dataIndex: 'shares', key: 'shares', render: (s: number) => s.toFixed(2) },
    { title: '费用', dataIndex: 'fee', key: 'fee', render: fmtMoney },
  ];

  const data = [...portfolio.transactions].reverse(); // 最新在前

  return (
    <Card title={`交易流水（${portfolio.transactions.length}）`} size="small">
      {data.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成交记录" />
      ) : (
        <Table rowKey="id" dataSource={data} columns={columns} pagination={{ pageSize: 10 }} size="small" scroll={{ x: 'max-content' }} />
      )}
    </Card>
  );
}
