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
import { FundCell } from '@/components/FundLabel';
import { useFundNames } from '@/hooks/useFundNames';
import type { Strategy } from '@fund/core';

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

function describeParams(s: Strategy): string {
  const p = s.params;
  const periodText = (period: 'DAILY' | 'WEEKLY' | 'MONTHLY') =>
    period === 'DAILY' ? '每日' : period === 'WEEKLY' ? '每周' : '每月';
  switch (p.type) {
    case 'DCA':
      return p.period === 'DAILY'
        ? `每日 投 ¥${p.amount}`
        : `${periodText(p.period)} ${p.dayOfPeriod} 投 ¥${p.amount}`;
    case 'BASE_POSITION':
      return `首日一次性建仓 ¥${p.amount}`;
    case 'SMART_DCA_CHANGE':
      return `${periodText(p.period)} ${p.period === 'DAILY' ? '' : p.dayOfPeriod} 基准¥${p.baseAmount}，近${p.referenceWindow}日每${(p.stepPct * 100).toFixed(0)}%调${(p.adjustPct * 100).toFixed(0)}%（×${p.minFactor}~${p.maxFactor}）`;
    case 'SMART_DCA_MA':
      return `${periodText(p.period)} ${p.period === 'DAILY' ? '' : p.dayOfPeriod} 基准¥${p.baseAmount}，${p.maWindow}日均线每${(p.stepPct * 100).toFixed(0)}%调${(p.adjustPct * 100).toFixed(0)}%（×${p.minFactor}~${p.maxFactor}）`;
    case 'VALUE_AVERAGING':
      return `${periodText(p.period)} ${p.period === 'DAILY' ? '' : p.dayOfPeriod} 每期目标+¥${p.targetStep}${p.allowSell ? '，超额卖出' : '，只买不卖'}${p.maxBuy ? `，单期≤¥${p.maxBuy}` : ''}`;
    case 'THRESHOLD_BUY':
      return `近${p.window}日跌${(p.dropPct * 100).toFixed(1)}% 买 ¥${p.amount}`;
    case 'SMART_THRESHOLD_BUY_CHANGE':
      return `近${p.window}日跌${(p.dropPct * 100).toFixed(1)}%起 基准买¥${p.baseAmount}，每${(p.stepPct * 100).toFixed(0)}%加码${(p.adjustPct * 100).toFixed(0)}%（×${p.minFactor}~${p.maxFactor}）`;
    case 'THRESHOLD_SELL':
      return `近${p.window}日涨${(p.risePct * 100).toFixed(1)}% 卖 ¥${p.amount}`;
    case 'SMART_THRESHOLD_SELL_CHANGE':
      return `近${p.window}日涨${(p.risePct * 100).toFixed(1)}%起 基准卖¥${p.baseAmount}，每${(p.stepPct * 100).toFixed(0)}%加码${(p.adjustPct * 100).toFixed(0)}%（×${p.minFactor}~${p.maxFactor}）`;
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
    renameSet,
    removeSet,
    addStrategy,
    updateStrategy,
    removeStrategy,
    removeStrategies,
    updateStrategiesFundCode,
    duplicateSet,
    removeSets,
    exportSet,
    importFromString,
  } = useStrategyStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [stratModal, setStratModal] = useState<{ open: boolean; editing: Strategy | null }>({
    open: false,
    editing: null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState('');
  // 策略批量选择（需求 4）
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<string[]>([]);
  const [batchFundOpen, setBatchFundOpen] = useState(false);
  const [batchFundCode, setBatchFundCode] = useState('');
  // 策略集批量选择（需求 5）
  const [selectedSetIds, setSelectedSetIds] = useState<string[]>([]);

  useEffect(() => {
    load();
  }, [load]);

  const set = current();
  const { resolve } = useFundNames(set?.strategies.map((s) => s.fundCode) ?? []);

  // 切换策略集时清空策略选择
  useEffect(() => {
    setSelectedStrategyIds([]);
  }, [currentId]);

  const submitRename = () => {
    const name = renameName.trim();
    if (!name) return message.warning('请输入名称');
    if (!set) return;
    if (name === set.name) {
      setRenameOpen(false);
      return;
    }
    if (sets.some((s) => s.id !== set.id && s.name === name)) {
      return message.warning('已存在同名策略集');
    }
    renameSet(set.id, name);
    message.success('已重命名');
    setRenameOpen(false);
  };

  const handleBatchDeleteStrategies = () => {
    if (!set || selectedStrategyIds.length === 0) return;
    removeStrategies(set.id, selectedStrategyIds);
    message.success(`已删除 ${selectedStrategyIds.length} 条策略`);
    setSelectedStrategyIds([]);
  };

  const submitBatchFundCode = () => {
    const code = batchFundCode.trim();
    if (!/^\d{6}$/.test(code)) return message.warning('请输入 6 位基金代码');
    if (!set || selectedStrategyIds.length === 0) return;
    updateStrategiesFundCode(set.id, selectedStrategyIds, code);
    message.success(`已批量修改 ${selectedStrategyIds.length} 条策略的标的为 ${code}`);
    setBatchFundOpen(false);
    setBatchFundCode('');
    setSelectedStrategyIds([]);
  };

  const handleDuplicateSet = () => {
    if (!set) return;
    const copy = duplicateSet(set.id);
    if (copy) message.success(`已复制副本：${copy.name}`);
  };

  const handleBatchDeleteSets = () => {
    if (selectedSetIds.length === 0) return;
    removeSets(selectedSetIds);
    message.success(`已删除 ${selectedSetIds.length} 个策略集`);
    setSelectedSetIds([]);
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型',
      dataIndex: 'templateType',
      key: 'templateType',
      render: (t: string) => <Tag>{TEMPLATE_LABEL[t]}</Tag>,
    },
    {
      title: '标的',
      dataIndex: 'fundCode',
      key: 'fundCode',
      render: (_: unknown, r: Strategy) => <FundCell code={r.fundCode} name={resolve(r.fundCode)} />,
    },
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
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
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
                disabled={!set}
              >
                导出当前
              </Button>
              <Button disabled={!set} onClick={handleDuplicateSet}>
                复制副本
              </Button>
              <Button
                disabled={!set}
                onClick={() => {
                  if (!set) return;
                  setRenameName(set.name);
                  setRenameOpen(true);
                }}
              >
                重命名
              </Button>
              <Popconfirm title="删除当前策略集？" onConfirm={() => set && removeSet(set.id)}>
                <Button danger disabled={!set}>
                  删除当前
                </Button>
              </Popconfirm>
            </Space>

            {/* 批量管理策略集（需求 5） */}
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                批量管理策略集
              </Typography.Text>
              <Space wrap style={{ width: '100%', marginTop: 4 }}>
                <Select
                  mode="multiple"
                  allowClear
                  style={{ minWidth: 280 }}
                  placeholder="选择要批量删除的策略集"
                  maxTagCount="responsive"
                  value={selectedSetIds}
                  onChange={setSelectedSetIds}
                  options={sets.map((s) => ({
                    label: `${s.name}（${s.strategies.length}）`,
                    value: s.id,
                  }))}
                />
                <Popconfirm
                  title={`确认删除选中的 ${selectedSetIds.length} 个策略集？`}
                  onConfirm={handleBatchDeleteSets}
                  disabled={selectedSetIds.length === 0}
                >
                  <Button danger disabled={selectedSetIds.length === 0}>
                    批量删除（{selectedSetIds.length}）
                  </Button>
                </Popconfirm>
              </Space>
            </div>
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
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {selectedStrategyIds.length > 0 && (
                <Space wrap>
                  <Typography.Text type="secondary">
                    已选 {selectedStrategyIds.length} 条
                  </Typography.Text>
                  <Button size="small" onClick={() => setBatchFundOpen(true)}>
                    批量修改标的
                  </Button>
                  <Popconfirm
                    title={`确认删除选中的 ${selectedStrategyIds.length} 条策略？`}
                    onConfirm={handleBatchDeleteStrategies}
                  >
                    <Button size="small" danger>
                      批量删除
                    </Button>
                  </Popconfirm>
                  <Button size="small" type="link" onClick={() => setSelectedStrategyIds([])}>
                    取消选择
                  </Button>
                </Space>
              )}
              <Table
                rowKey="id"
                dataSource={set.strategies}
                columns={columns}
                pagination={false}
                size="small"
                scroll={{ x: 'max-content' }}
                rowSelection={{
                  selectedRowKeys: selectedStrategyIds,
                  onChange: (keys) => setSelectedStrategyIds(keys as string[]),
                }}
              />
            </Space>
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

      {/* 重命名策略集 */}
      <Modal
        title="重命名策略集"
        open={renameOpen}
        onOk={submitRename}
        onCancel={() => setRenameOpen(false)}
      >
        <Input
          placeholder="策略集名称"
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onPressEnter={submitRename}
        />
      </Modal>

      {/* 批量修改标的 */}
      <Modal
        title="批量修改标的基金代码"
        open={batchFundOpen}
        onOk={submitBatchFundCode}
        onCancel={() => setBatchFundOpen(false)}
      >
        <Typography.Paragraph type="secondary">
          将选中的 {selectedStrategyIds.length} 条策略的标的基金统一改为：
        </Typography.Paragraph>
        <Input
          placeholder="6 位基金代码"
          maxLength={6}
          value={batchFundCode}
          onChange={(e) => setBatchFundCode(e.target.value)}
          onPressEnter={submitBatchFundCode}
        />
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
