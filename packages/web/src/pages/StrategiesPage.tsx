import { useEffect, useState } from 'react';
import {
  Card,
  Select,
  Button,
  Space,
  Table,
  Tag,
  Empty,
  Modal,
  Input,
  App,
  Popconfirm,
  Switch,
  Typography,
} from 'antd';
import { useStrategyStore } from '@/stores/strategyStore';
import { StrategyModal } from '@/components/StrategyModal';
import type { Strategy } from '@fund/core';

const TEMPLATE_LABEL: Record<string, string> = {
  DCA: '定投',
  SMART_DCA_CHANGE: '智能定投·涨跌幅',
  SMART_DCA_MA: '智能定投·均线',
  VALUE_AVERAGING: '目标市值法',
  THRESHOLD_BUY: '阈值买入',
  THRESHOLD_SELL: '阈值卖出',
  TAKE_PROFIT: '止盈',
  SMART_TAKE_PROFIT: '智能止盈',
  STOP_LOSS: '止损',
  GRID: '网格',
};

function describeParams(s: Strategy): string {
  const p = s.params;
  switch (p.type) {
    case 'DCA':
      return `${p.period === 'WEEKLY' ? '每周' : '每月'} ${p.dayOfPeriod} 投 ¥${p.amount}`;
    case 'SMART_DCA_CHANGE':
      return `${p.period === 'WEEKLY' ? '每周' : '每月'} ${p.dayOfPeriod} 基准¥${p.baseAmount}，近${p.referenceWindow}日每${(p.stepPct * 100).toFixed(0)}%调${(p.adjustPct * 100).toFixed(0)}%（×${p.minFactor}~${p.maxFactor}）`;
    case 'SMART_DCA_MA':
      return `${p.period === 'WEEKLY' ? '每周' : '每月'} ${p.dayOfPeriod} 基准¥${p.baseAmount}，${p.maWindow}日均线每${(p.stepPct * 100).toFixed(0)}%调${(p.adjustPct * 100).toFixed(0)}%（×${p.minFactor}~${p.maxFactor}）`;
    case 'VALUE_AVERAGING':
      return `${p.period === 'WEEKLY' ? '每周' : '每月'} ${p.dayOfPeriod} 每期目标+¥${p.targetStep}${p.allowSell ? '，超额卖出' : '，只买不卖'}${p.maxBuy ? `，单期≤¥${p.maxBuy}` : ''}`;
    case 'THRESHOLD_BUY':
      return `近${p.window}日跌${(p.dropPct * 100).toFixed(1)}% 买 ¥${p.amount}`;
    case 'THRESHOLD_SELL':
      return `近${p.window}日涨${(p.risePct * 100).toFixed(1)}% 卖 ¥${p.amount}`;
    case 'TAKE_PROFIT':
      return `+${(p.gainPct * 100).toFixed(0)}% 卖${(p.sellRatio * 100).toFixed(0)}%`;
    case 'SMART_TAKE_PROFIT':
      return `+${(p.startGainPct * 100).toFixed(0)}%起，每+${(p.stepPct * 100).toFixed(0)}%卖${(p.stepSellRatio * 100).toFixed(0)}%（≤${(p.maxSellRatio * 100).toFixed(0)}%）`;
    case 'STOP_LOSS':
      return `-${(p.lossPct * 100).toFixed(0)}% 卖${(p.sellRatio * 100).toFixed(0)}%`;
    case 'GRID':
      return `[${p.lower}, ${p.upper}] ${p.grids}格 ¥${p.perGridAmount}/格`;
  }
}

export function StrategiesPage() {
  const { message } = App.useApp();
  const {
    sets,
    currentId,
    current,
    setCurrent,
    load,
    createSet,
    removeSet,
    addStrategy,
    updateStrategy,
    removeStrategy,
    exportSet,
    importFromString,
  } = useStrategyStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [stratModal, setStratModal] = useState<{ open: boolean; editing: Strategy | null }>({
    open: false,
    editing: null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState('');

  useEffect(() => {
    load();
  }, [load]);

  const set = current();

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型',
      dataIndex: 'templateType',
      key: 'templateType',
      render: (t: string) => <Tag>{TEMPLATE_LABEL[t]}</Tag>,
    },
    { title: '标的', dataIndex: 'fundCode', key: 'fundCode' },
    { title: '参数', key: 'params', render: (_: unknown, r: Strategy) => describeParams(r) },
    {
      title: '启用',
      key: 'enabled',
      render: (_: unknown, r: Strategy) => (
        <Switch
          size="small"
          checked={r.enabled}
          onChange={(v) => set && updateStrategy(set.id, { ...r, enabled: v })}
        />
      ),
    },
    {
      title: '操作',
      key: 'op',
      render: (_: unknown, r: Strategy) => (
        <Space>
          <Button size="small" onClick={() => setStratModal({ open: true, editing: r })}>
            编辑
          </Button>
          <Popconfirm title="删除该策略？" onConfirm={() => set && removeStrategy(set.id, r.id)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card
        title="策略集"
        extra={
          <Space>
            <Button onClick={() => setImportOpen(true)}>导入</Button>
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              新建策略集
            </Button>
          </Space>
        }
      >
        {sets.length === 0 ? (
          <Empty description="还没有策略集，点击右上角新建" />
        ) : (
          <Space wrap>
            <Select
              value={currentId ?? undefined}
              style={{ minWidth: 200 }}
              onChange={setCurrent}
              options={sets.map((s) => ({ label: `${s.name}（${s.strategies.length}）`, value: s.id }))}
            />
            <Button
              onClick={() => {
                if (!set) return;
                setExportText(exportSet(set.id));
                setExportOpen(true);
              }}
            >
              导出当前
            </Button>
            <Popconfirm title="删除当前策略集？" onConfirm={() => set && removeSet(set.id)}>
              <Button danger disabled={!set}>
                删除当前
              </Button>
            </Popconfirm>
          </Space>
        )}
      </Card>

      {set && (
        <Card
          title={`策略列表 — ${set.name}`}
          extra={
            <Button type="primary" onClick={() => setStratModal({ open: true, editing: null })}>
              新增策略
            </Button>
          }
        >
          {set.strategies.length === 0 ? (
            <Empty description="该策略集暂无策略" />
          ) : (
            <Table rowKey="id" dataSource={set.strategies} columns={columns} pagination={false} size="small" />
          )}
        </Card>
      )}

      {/* 新建策略集 */}
      <Modal
        title="新建策略集"
        open={createOpen}
        onOk={() => {
          if (!newName.trim()) return message.warning('请输入名称');
          createSet(newName.trim());
          setNewName('');
          setCreateOpen(false);
        }}
        onCancel={() => setCreateOpen(false)}
      >
        <Input placeholder="策略集名称" value={newName} onChange={(e) => setNewName(e.target.value)} />
      </Modal>

      {/* 策略编辑 */}
      <StrategyModal
        open={stratModal.open}
        editing={stratModal.editing}
        onClose={() => setStratModal({ open: false, editing: null })}
        onSubmit={(data) => {
          if (!set) return;
          if ('id' in data) updateStrategy(set.id, data);
          else addStrategy(set.id, data);
          message.success('已保存策略');
        }}
      />

      {/* 导入 */}
      <Modal
        title="导入策略集"
        open={importOpen}
        okText="导入"
        onOk={() => {
          try {
            const s = importFromString(importText.trim());
            message.success(`已导入：${s.name}`);
            setImportText('');
            setImportOpen(false);
          } catch (e) {
            message.error(e instanceof Error ? e.message : '导入失败');
          }
        }}
        onCancel={() => setImportOpen(false)}
      >
        <Typography.Paragraph type="secondary">粘贴以 FUNDSS1: 开头的导出字符串。</Typography.Paragraph>
        <Input.TextArea rows={6} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="FUNDSS1:..." />
      </Modal>

      {/* 导出 */}
      <Modal
        title="导出策略集"
        open={exportOpen}
        onCancel={() => setExportOpen(false)}
        footer={[
          <Button
            key="copy"
            type="primary"
            onClick={() => {
              navigator.clipboard?.writeText(exportText);
              message.success('已复制');
            }}
          >
            复制
          </Button>,
          <Button key="close" onClick={() => setExportOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <Input.TextArea rows={6} value={exportText} readOnly />
      </Modal>
    </Space>
  );
}
