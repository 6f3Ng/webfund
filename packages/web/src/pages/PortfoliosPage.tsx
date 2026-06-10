import { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  App,
  Popconfirm,
  Typography,
  Divider,
  Tooltip,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { usePortfolioStore, hasInFlightState } from '@/stores/portfolioStore';
import { fmtMoney } from '@/utils/format';
import type { Portfolio } from '@fund/core';

export function PortfoliosPage() {
  const { message } = App.useApp();
  const { portfolios, load, create, rename, edit, remove, duplicate, removeMany, merge, exportCurrent, setCurrent, importFromString } =
    usePortfolioStore();

  const [createForm] = Form.useForm();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState('');
  const [renaming, setRenaming] = useState<Portfolio | null>(null);
  const [renameForm] = Form.useForm();
  const [editing, setEditing] = useState<Portfolio | null>(null);
  const [editForm] = Form.useForm();
  // 批量删除选择（需求 5）
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 合并集合
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeName, setMergeName] = useState('');

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    const v = await createForm.validateFields();
    const positions = (v.positions ?? [])
      .filter((p: { fundCode?: string } | undefined): p is { fundCode: string; shares: number; costPrice: number } =>
        Boolean(p && p.fundCode),
      )
      .map((p: { fundCode: string; shares: number; costPrice: number }) => ({
        fundCode: p.fundCode.trim(),
        shares: p.shares,
        costPrice: p.costPrice,
      }));
    create(v.name.trim(), v.initialCash, positions);
    message.success('已创建持仓集合');
    createForm.resetFields();
    setCreateOpen(false);
  };

  const handleExport = (p: Portfolio) => {
    setCurrent(p.id);
    // 直接对该集合导出
    try {
      const text = exportCurrentFor(p.id, exportCurrent, setCurrent);
      setExportText(text);
      setExportOpen(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '导出失败');
    }
  };

  const handleImport = () => {
    try {
      const pf = importFromString(importText.trim());
      message.success(`已导入：${pf.name}`);
      setImportText('');
      setImportOpen(false);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '导入失败，请检查内容');
    }
  };

  const handleRename = async () => {
    if (!renaming) return;
    const v = await renameForm.validateFields();
    rename(renaming.id, v.name.trim());
    message.success('已重命名');
    setRenaming(null);
  };

  const openEdit = (pf: Portfolio) => {
    // 仅设置 editing；表单预填充经 <Form initialValues> + key 在挂载时生效，
    // 避免 destroyOnHidden 下 Form 未挂载时 setFieldsValue 丢失（同 ADJ-8 思路）。
    setEditing(pf);
  };

  const handleEdit = async () => {
    if (!editing) return;
    const v = await editForm.validateFields();
    const positions = (v.positions ?? [])
      .filter((p: { fundCode?: string } | undefined): p is { fundCode: string; shares: number; costPrice: number } =>
        Boolean(p && p.fundCode),
      )
      .map((p: { fundCode: string; shares: number; costPrice: number }) => ({
        fundCode: p.fundCode.trim(),
        shares: p.shares,
        costPrice: p.costPrice,
      }));
    try {
      edit(editing.id, { name: v.name.trim(), initialCash: v.initialCash, positions });
      message.success('已保存编辑');
      setEditing(null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  const handleDuplicate = (p: Portfolio) => {
    const copy = duplicate(p.id);
    if (copy) message.success(`已复制副本：${copy.name}`);
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    removeMany(selectedIds);
    message.success(`已删除 ${selectedIds.length} 个集合`);
    setSelectedIds([]);
  };

  // 选中集合是否存在在途交易（合并复用工厂重建会清空流水/在途，故有在途时禁止合并）
  const selectedHasInFlight = portfolios.some(
    (p) => selectedIds.includes(p.id) && hasInFlightState(p),
  );

  const submitMerge = () => {
    const name = mergeName.trim();
    if (!name) return message.warning('请输入合并后集合名称');
    if (selectedIds.length < 2) return message.warning('请选择至少两个集合合并');
    try {
      const merged = merge(selectedIds, name);
      message.success(`已合并为：${merged.name}（${merged.positions.length} 只基金）`);
      setMergeOpen(false);
      setMergeName('');
      setSelectedIds([]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '合并失败');
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '初始资金', dataIndex: 'initialCash', key: 'initialCash', render: fmtMoney },
    { title: '可用现金', dataIndex: 'cash', key: 'cash', render: fmtMoney },
    {
      title: '持仓数',
      key: 'posCount',
      render: (_: unknown, r: Portfolio) => r.positions.length,
    },
    {
      title: '操作',
      key: 'op',
      render: (_: unknown, r: Portfolio) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setRenaming(r);
              renameForm.setFieldsValue({ name: r.name });
            }}
          >
            重命名
          </Button>
          {(() => {
            const inFlight = hasInFlightState(r);
            const editBtn = (
              <Button size="small" disabled={inFlight} onClick={() => openEdit(r)}>
                编辑
              </Button>
            );
            return inFlight ? (
              <Tooltip title="存在在途交易（待确认订单/在途资金/在途份额），暂不可编辑">
                {/* span 包裹以便 disabled 按钮仍能触发 Tooltip */}
                <span>{editBtn}</span>
              </Tooltip>
            ) : (
              editBtn
            );
          })()}
          <Button size="small" onClick={() => handleExport(r)}>
            导出
          </Button>
          <Button size="small" onClick={() => handleDuplicate(r)}>
            复制
          </Button>
          <Popconfirm title="确认删除该集合？" onConfirm={() => remove(r.id)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="持仓集合管理"
      extra={
        <Space>
          <Button onClick={() => setImportOpen(true)}>导入</Button>
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            新建集合
          </Button>
        </Space>
      }
    >
      {selectedIds.length > 0 && (
        <Space wrap style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">已选 {selectedIds.length} 个集合</Typography.Text>
          <Tooltip
            title={
              selectedHasInFlight
                ? '选中的集合存在在途交易（待确认订单/在途资金/在途份额），暂不可合并'
                : ''
            }
          >
            <Button
              size="small"
              disabled={selectedIds.length < 2 || selectedHasInFlight}
              onClick={() => {
                setMergeName('合并集合');
                setMergeOpen(true);
              }}
            >
              合并为新集合（{selectedIds.length}）
            </Button>
          </Tooltip>
          <Popconfirm
            title={`确认删除选中的 ${selectedIds.length} 个集合？`}
            onConfirm={handleBatchDelete}
          >
            <Button danger size="small">
              批量删除
            </Button>
          </Popconfirm>
          <Button size="small" type="link" onClick={() => setSelectedIds([])}>
            取消选择
          </Button>
        </Space>
      )}
      <Table
        rowKey="id"
        dataSource={portfolios}
        columns={columns}
        pagination={false}
        scroll={{ x: 'max-content' }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as string[]),
        }}
      />

      <Modal
        title="新建持仓集合"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
        width={640}
        style={{ maxWidth: '96vw' }}
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="集合名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 稳健组合" />
          </Form.Item>
          <Form.Item
            name="initialCash"
            label="初始可用现金（元）"
            initialValue={100000}
            rules={[{ required: true, type: 'number', min: 0 }]}
            extra="若配置了现有持仓，收益基准 = 现金 + 持仓成本之和"
          >
            <InputNumber style={{ width: '100%' }} min={0} step={10000} />
          </Form.Item>

          <Divider orientation="left" plain>
            现有持仓（可选）
          </Divider>
          {renderPositionList()}
        </Form>
      </Modal>

      <Modal
        title="导入持仓集合"
        open={importOpen}
        onOk={handleImport}
        onCancel={() => setImportOpen(false)}
        okText="导入"
      >
        <Typography.Paragraph type="secondary">
          粘贴以 FUNDPF1: 开头的导出字符串，重名将自动生成副本。
        </Typography.Paragraph>
        <Input.TextArea
          rows={6}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="FUNDPF1:..."
        />
      </Modal>

      <Modal
        title="导出持仓集合"
        open={exportOpen}
        onCancel={() => setExportOpen(false)}
        footer={[
          <Button
            key="copy"
            type="primary"
            onClick={() => {
              navigator.clipboard?.writeText(exportText);
              message.success('已复制到剪贴板');
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

      <Modal
        title="合并持仓集合"
        open={mergeOpen}
        onOk={submitMerge}
        onCancel={() => setMergeOpen(false)}
        okText="合并"
      >
        <Typography.Paragraph type="secondary">
          将选中的 {selectedIds.length} 个集合合并为一个新集合：可用现金相加，同一基金的持仓按份额合并、成本加权平均；
          收益基准 = 合并后现金 + 持仓成本之和。来源集合保留不变。
        </Typography.Paragraph>
        <Input
          placeholder="合并后集合名称"
          value={mergeName}
          onChange={(e) => setMergeName(e.target.value)}
          onPressEnter={submitMerge}
        />
      </Modal>

      <Modal title="重命名" open={!!renaming} onOk={handleRename} onCancel={() => setRenaming(null)} destroyOnHidden>
        <Form form={renameForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="新名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑持仓集合"
        open={!!editing}
        onOk={handleEdit}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        width={640}
        style={{ maxWidth: '96vw' }}
      >
        <Form
          key={editing?.id ?? 'edit'}
          form={editForm}
          layout="vertical"
          preserve={false}
          initialValues={editing ? toEditFormValues(editing) : undefined}
        >
          <Form.Item name="name" label="集合名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 稳健组合" />
          </Form.Item>
          <Form.Item
            name="initialCash"
            label="可用现金（元）"
            rules={[{ required: true, type: 'number', min: 0 }]}
            extra="编辑将以「可用现金 + 持仓成本」重算收益基准，并重置模拟起点（清空历史流水）"
          >
            <InputNumber style={{ width: '100%' }} min={0} step={10000} />
          </Form.Item>

          <Divider orientation="left" plain>
            现有持仓
          </Divider>
          {renderPositionList()}
        </Form>
      </Modal>
    </Card>
  );
}

/** 四舍五入到 4 位小数（成本单价精度），规避浮点误差。 */
function round4(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round((value + Number.EPSILON) * 1e4) / 1e4;
}

/**
 * 将持仓集合映射为编辑表单初始值（纯函数，便于单测）。
 *
 * - `name`：集合名称
 * - `initialCash`：取当前可用现金 `pf.cash`（而非含历史成本的基准 `pf.initialCash`），
 *   使工厂以「可用现金 + 持仓成本」重算口径正确，避免成本被双重计入
 * - `positions`：由每个持仓的 `cost/shares` 反推 `costPrice`（`shares>0` 时 `round4(cost/shares)`，否则 0）
 */
export function toEditFormValues(pf: Portfolio): {
  name: string;
  initialCash: number;
  positions: { fundCode: string; shares: number; costPrice: number }[];
} {
  return {
    name: pf.name,
    initialCash: pf.cash,
    positions: pf.positions.map((p) => ({
      fundCode: p.fundCode,
      shares: p.shares,
      costPrice: p.shares > 0 ? round4(p.cost / p.shares) : 0,
    })),
  };
}

/** 导出指定 id 的集合（临时切换 current 实现，保持 store API 简洁） */
function exportCurrentFor(
  id: string,
  exportCurrent: () => string,
  setCurrent: (id: string) => void,
): string {
  setCurrent(id);
  return exportCurrent();
}

/**
 * 共享的持仓行 `Form.List` 渲染片段。
 *
 * 承载每行三字段（`fundCode` 6 位代码 pattern / `shares` min 0.0001 / `costPrice` precision 4）
 * 及增删行操作。新建与编辑弹窗共用此片段，确保两处字段规则一致、不漂移。
 */
function renderPositionList() {
  return (
    <Form.List name="positions">
      {(fields, { add, remove }) => (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {fields.map((field) => (
            <Space key={field.key} align="baseline" wrap>
              <Form.Item
                name={[field.name, 'fundCode']}
                rules={[{ required: true, pattern: /^\d{6}$/, message: '6 位代码' }]}
                style={{ marginBottom: 0 }}
              >
                <Input placeholder="基金代码" maxLength={6} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item
                name={[field.name, 'shares']}
                rules={[{ required: true, type: 'number', min: 0.0001, message: '份额' }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber placeholder="持有份额" min={0.0001} step={100} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item
                name={[field.name, 'costPrice']}
                rules={[{ required: true, type: 'number', min: 0, message: '成本单价' }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber
                  placeholder="成本单价"
                  min={0}
                  step={0.0001}
                  precision={4}
                  style={{ width: 140 }}
                />
              </Form.Item>
              <Button danger size="small" onClick={() => remove(field.name)}>
                删除
              </Button>
            </Space>
          ))}
          <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
            添加持仓
          </Button>
        </Space>
      )}
    </Form.List>
  );
}
