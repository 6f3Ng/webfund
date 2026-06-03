import { useRef } from 'react';
import { Modal, Form, Input, InputNumber, Select, Button, Space, Switch } from 'antd';
import type { Strategy, StrategyParams, StrategyTemplate, DcaPeriod } from '@fund/core';

interface StrategyModalProps {
  open: boolean;
  /** 编辑时传入现有策略 */
  editing?: Strategy | null;
  onSubmit: (data: Omit<Strategy, 'id'> | Strategy) => void;
  onClose: () => void;
}

const TEMPLATE_OPTIONS: { label: string; value: StrategyTemplate }[] = [
  { label: '定投（DCA）', value: 'DCA' },
  { label: '底仓（首日一次性建仓）', value: 'BASE_POSITION' },
  { label: '智能定投-涨跌幅模式', value: 'SMART_DCA_CHANGE' },
  { label: '智能定投-均线模式', value: 'SMART_DCA_MA' },
  { label: '目标市值法定投（推荐）', value: 'VALUE_AVERAGING' },
  { label: '阈值买入（跌幅触发）', value: 'THRESHOLD_BUY' },
  { label: '智能阈值买入-涨跌幅模式', value: 'SMART_THRESHOLD_BUY_CHANGE' },
  { label: '阈值卖出（涨幅触发）', value: 'THRESHOLD_SELL' },
  { label: '智能阈值卖出-涨跌幅模式', value: 'SMART_THRESHOLD_SELL_CHANGE' },
  { label: '止盈', value: 'TAKE_PROFIT' },
  { label: '智能止盈（分档加码卖出）', value: 'SMART_TAKE_PROFIT' },
  { label: '止损', value: 'STOP_LOSS' },
  { label: '网格', value: 'GRID' },
];

/** 根据模板类型 + 表单值组装 params */
function buildParams(
  type: StrategyTemplate,
  v: Record<string, number | string | boolean>,
): StrategyParams {
  switch (type) {
    case 'DCA':
      return {
        type: 'DCA',
        period: v.period as DcaPeriod,
        dayOfPeriod: Number(v.dayOfPeriod),
        amount: Number(v.amount),
      };
    case 'BASE_POSITION':
      return { type: 'BASE_POSITION', amount: Number(v.amount) };
    case 'SMART_DCA_CHANGE':
      return {
        type: 'SMART_DCA_CHANGE',
        period: v.period as DcaPeriod,
        dayOfPeriod: Number(v.dayOfPeriod),
        baseAmount: Number(v.baseAmount),
        referenceWindow: Number(v.referenceWindow),
        stepPct: Number(v.stepPct) / 100,
        adjustPct: Number(v.adjustPct) / 100,
        minFactor: Number(v.minFactor),
        maxFactor: Number(v.maxFactor),
      };
    case 'SMART_DCA_MA':
      return {
        type: 'SMART_DCA_MA',
        period: v.period as DcaPeriod,
        dayOfPeriod: Number(v.dayOfPeriod),
        baseAmount: Number(v.baseAmount),
        maWindow: Number(v.maWindow),
        stepPct: Number(v.stepPct) / 100,
        adjustPct: Number(v.adjustPct) / 100,
        minFactor: Number(v.minFactor),
        maxFactor: Number(v.maxFactor),
      };
    case 'VALUE_AVERAGING':
      return {
        type: 'VALUE_AVERAGING',
        period: v.period as DcaPeriod,
        dayOfPeriod: Number(v.dayOfPeriod),
        targetStep: Number(v.targetStep),
        allowSell: v.allowSell === true,
        maxBuy: Number(v.maxBuy) || 0,
      };
    case 'THRESHOLD_BUY':
      return {
        type: 'THRESHOLD_BUY',
        dropPct: Number(v.dropPct) / 100,
        window: Number(v.window),
        amount: Number(v.amount),
      };
    case 'SMART_THRESHOLD_BUY_CHANGE':
      return {
        type: 'SMART_THRESHOLD_BUY_CHANGE',
        dropPct: Number(v.dropPct) / 100,
        window: Number(v.window),
        baseAmount: Number(v.baseAmount),
        stepPct: Number(v.stepPct) / 100,
        adjustPct: Number(v.adjustPct) / 100,
        minFactor: Number(v.minFactor),
        maxFactor: Number(v.maxFactor),
      };
    case 'THRESHOLD_SELL':
      return {
        type: 'THRESHOLD_SELL',
        risePct: Number(v.risePct) / 100,
        window: Number(v.window),
        amount: Number(v.amount),
      };
    case 'SMART_THRESHOLD_SELL_CHANGE':
      return {
        type: 'SMART_THRESHOLD_SELL_CHANGE',
        risePct: Number(v.risePct) / 100,
        window: Number(v.window),
        baseAmount: Number(v.baseAmount),
        stepPct: Number(v.stepPct) / 100,
        adjustPct: Number(v.adjustPct) / 100,
        minFactor: Number(v.minFactor),
        maxFactor: Number(v.maxFactor),
      };
    case 'TAKE_PROFIT':
      return { type: 'TAKE_PROFIT', gainPct: Number(v.gainPct) / 100, sellRatio: Number(v.sellRatio) / 100 };
    case 'SMART_TAKE_PROFIT':
      return {
        type: 'SMART_TAKE_PROFIT',
        startGainPct: Number(v.startGainPct) / 100,
        stepPct: Number(v.stepPct) / 100,
        stepSellRatio: Number(v.stepSellRatio) / 100,
        maxSellRatio: Number(v.maxSellRatio) / 100,
      };
    case 'STOP_LOSS':
      return { type: 'STOP_LOSS', lossPct: Number(v.lossPct) / 100, sellRatio: Number(v.sellRatio) / 100 };
    case 'GRID':
      return {
        type: 'GRID',
        lower: Number(v.lower),
        upper: Number(v.upper),
        grids: Number(v.grids),
        perGridAmount: Number(v.perGridAmount),
      };
  }
}

/** 将现有 params 拆解回表单初值（百分比字段 ×100） */
function paramsToForm(p: StrategyParams): Record<string, number | string | boolean> {
  switch (p.type) {
    case 'DCA':
      return { period: p.period, dayOfPeriod: p.dayOfPeriod, amount: p.amount };
    case 'BASE_POSITION':
      return { amount: p.amount };
    case 'SMART_DCA_CHANGE':
      return {
        period: p.period,
        dayOfPeriod: p.dayOfPeriod,
        baseAmount: p.baseAmount,
        referenceWindow: p.referenceWindow,
        stepPct: p.stepPct * 100,
        adjustPct: p.adjustPct * 100,
        minFactor: p.minFactor,
        maxFactor: p.maxFactor,
      };
    case 'SMART_DCA_MA':
      return {
        period: p.period,
        dayOfPeriod: p.dayOfPeriod,
        baseAmount: p.baseAmount,
        maWindow: p.maWindow,
        stepPct: p.stepPct * 100,
        adjustPct: p.adjustPct * 100,
        minFactor: p.minFactor,
        maxFactor: p.maxFactor,
      };
    case 'VALUE_AVERAGING':
      return {
        period: p.period,
        dayOfPeriod: p.dayOfPeriod,
        targetStep: p.targetStep,
        allowSell: p.allowSell,
        maxBuy: p.maxBuy,
      };
    case 'THRESHOLD_BUY':
      return { dropPct: p.dropPct * 100, window: p.window, amount: p.amount };
    case 'SMART_THRESHOLD_BUY_CHANGE':
      return {
        dropPct: p.dropPct * 100,
        window: p.window,
        baseAmount: p.baseAmount,
        stepPct: p.stepPct * 100,
        adjustPct: p.adjustPct * 100,
        minFactor: p.minFactor,
        maxFactor: p.maxFactor,
      };
    case 'THRESHOLD_SELL':
      return { risePct: p.risePct * 100, window: p.window, amount: p.amount };
    case 'SMART_THRESHOLD_SELL_CHANGE':
      return {
        risePct: p.risePct * 100,
        window: p.window,
        baseAmount: p.baseAmount,
        stepPct: p.stepPct * 100,
        adjustPct: p.adjustPct * 100,
        minFactor: p.minFactor,
        maxFactor: p.maxFactor,
      };
    case 'TAKE_PROFIT':
      return { gainPct: p.gainPct * 100, sellRatio: p.sellRatio * 100 };
    case 'SMART_TAKE_PROFIT':
      return {
        startGainPct: p.startGainPct * 100,
        stepPct: p.stepPct * 100,
        stepSellRatio: p.stepSellRatio * 100,
        maxSellRatio: p.maxSellRatio * 100,
      };
    case 'STOP_LOSS':
      return { lossPct: p.lossPct * 100, sellRatio: p.sellRatio * 100 };
    case 'GRID':
      return { lower: p.lower, upper: p.upper, grids: p.grids, perGridAmount: p.perGridAmount };
  }
}

/** 各模板的默认参数表单值（新增时按所选类型填充） */
function defaultFormForTemplate(type: StrategyTemplate): Record<string, number | string | boolean> {
  switch (type) {
    case 'DCA':
      return { period: 'MONTHLY', dayOfPeriod: 1, amount: 1000 };
    case 'BASE_POSITION':
      return { amount: 50000 };
    case 'SMART_DCA_CHANGE':
      return {
        period: 'MONTHLY',
        dayOfPeriod: 1,
        baseAmount: 1000,
        referenceWindow: 20,
        stepPct: 10,
        adjustPct: 10,
        minFactor: 0,
        maxFactor: 2,
      };
    case 'SMART_DCA_MA':
      return {
        period: 'MONTHLY',
        dayOfPeriod: 1,
        baseAmount: 1000,
        maWindow: 250,
        stepPct: 10,
        adjustPct: 10,
        minFactor: 0,
        maxFactor: 2,
      };
    case 'VALUE_AVERAGING':
      return { period: 'MONTHLY', dayOfPeriod: 1, targetStep: 2000, allowSell: true, maxBuy: 0 };
    case 'THRESHOLD_BUY':
      return { dropPct: 5, window: 5, amount: 1000 };
    case 'SMART_THRESHOLD_BUY_CHANGE':
      return {
        dropPct: 5,
        window: 5,
        baseAmount: 1000,
        stepPct: 5,
        adjustPct: 50,
        minFactor: 1,
        maxFactor: 3,
      };
    case 'THRESHOLD_SELL':
      return { risePct: 5, window: 5, amount: 1000 };
    case 'SMART_THRESHOLD_SELL_CHANGE':
      return {
        risePct: 5,
        window: 5,
        baseAmount: 1000,
        stepPct: 5,
        adjustPct: 50,
        minFactor: 1,
        maxFactor: 3,
      };
    case 'TAKE_PROFIT':
      return { gainPct: 20, sellRatio: 100 };
    case 'SMART_TAKE_PROFIT':
      return { startGainPct: 10, stepPct: 10, stepSellRatio: 20, maxSellRatio: 50 };
    case 'STOP_LOSS':
      return { lossPct: 10, sellRatio: 100 };
    case 'GRID':
      return { lower: 1, upper: 2, grids: 10, perGridAmount: 1000 };
  }
}

/** 定投周期选项（每日 / 每周 / 每月） */
const PERIOD_OPTIONS = [
  { label: '每日', value: 'DAILY' },
  { label: '每周', value: 'WEEKLY' },
  { label: '每月', value: 'MONTHLY' },
];

/**
 * 定投周期 + 执行日字段（DCA / 智能定投 / 目标市值法共用）。
 * 选「每日」时执行日无意义，隐藏 dayOfPeriod 输入（每个交易日定投一次）。
 */
function PeriodFields({ form }: { form: ReturnType<typeof Form.useForm>[0] }) {
  const period = Form.useWatch('period', form) as DcaPeriod | undefined;
  return (
    <>
      <Form.Item name="period" label="定投周期" rules={[{ required: true }]}>
        <Select options={PERIOD_OPTIONS} />
      </Form.Item>
      {period !== 'DAILY' && (
        <Form.Item
          name="dayOfPeriod"
          label="执行日（每周1-7 / 每月1-28）"
          rules={[{ required: true, type: 'number', min: 1, max: 28 }]}
        >
          <InputNumber style={{ width: '100%' }} min={1} max={28} />
        </Form.Item>
      )}
    </>
  );
}

/**
 * 外层仅负责 Modal 开关；表单内容在打开时才挂载，且用随每次打开递增的 key 强制重建，
 * 保证每次打开都是全新的 Form 实例，避免上一次编辑的值残留（新增时被回填的 bug）。
 */
export function StrategyModal(props: StrategyModalProps) {
  // 每次从关闭→打开都递增，作为 StrategyForm 的 key，确保彻底重新挂载
  const openSeq = useRef(0);
  const prevOpen = useRef(false);
  if (props.open && !prevOpen.current) openSeq.current += 1;
  prevOpen.current = props.open;

  return (
    <Modal
      title={props.editing ? '编辑策略' : '新增策略'}
      open={props.open}
      onCancel={props.onClose}
      footer={null}
      destroyOnHidden
      width={520}
    >
      {props.open && (
        <StrategyForm key={`${openSeq.current}:${props.editing?.id ?? 'new'}`} {...props} />
      )}
    </Modal>
  );
}

function StrategyForm({ editing, onSubmit, onClose }: StrategyModalProps) {
  const [form] = Form.useForm();
  const templateType = Form.useWatch('templateType', form) as StrategyTemplate | undefined;

  // 初值：编辑时回填该条策略字段；新增时默认 DCA + 其默认参数。
  const initialValues = editing
    ? {
        name: editing.name,
        fundCode: editing.fundCode,
        templateType: editing.templateType,
        ...paramsToForm(editing.params),
      }
    : { templateType: 'DCA' as StrategyTemplate, ...defaultFormForTemplate('DCA') };

  // 切换策略类型时，用该类型默认参数填充（保留 name/fundCode）
  const handleValuesChange = (changed: Record<string, unknown>) => {
    if ('templateType' in changed) {
      const next = changed.templateType as StrategyTemplate;
      form.setFieldsValue(defaultFormForTemplate(next));
    }
  };

  const handleOk = async () => {
    const v = await form.validateFields();
    const type = v.templateType as StrategyTemplate;
    const base = {
      name: v.name.trim(),
      templateType: type,
      fundCode: v.fundCode.trim(),
      params: buildParams(type, v),
      enabled: true,
    };
    onSubmit(editing ? { ...base, id: editing.id, enabled: editing.enabled } : base);
    onClose();
  };

  return (
    <Form form={form} layout="vertical" initialValues={initialValues} onValuesChange={handleValuesChange}>
      <Form.Item name="name" label="策略名称" rules={[{ required: true, message: '请输入名称' }]}>
        <Input placeholder="如 沪深300定投" />
      </Form.Item>
      <Form.Item
        name="fundCode"
        label="标的基金代码"
        rules={[{ required: true, pattern: /^\d{6}$/, message: '请输入 6 位基金代码' }]}
      >
        <Input placeholder="如 000001" maxLength={6} />
      </Form.Item>
      <Form.Item name="templateType" label="策略类型" rules={[{ required: true }]}>
        <Select options={TEMPLATE_OPTIONS} />
      </Form.Item>

      {templateType === 'DCA' && (
        <>
          <PeriodFields form={form} />
          <Form.Item name="amount" label="每次定投金额（元）" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} step={500} />
          </Form.Item>
        </>
      )}

      {templateType === 'BASE_POSITION' && (
        <Form.Item
          name="amount"
          label="建仓金额（元）"
          tooltip="在回测/模拟的第一个交易日一次性买入建立底仓，之后不再操作；可与定投等策略组合"
          rules={[{ required: true, type: 'number', min: 1 }]}
        >
          <InputNumber style={{ width: '100%' }} min={1} step={10000} />
        </Form.Item>
      )}

      {(templateType === 'SMART_DCA_CHANGE' || templateType === 'SMART_DCA_MA') && (
        <>
          <PeriodFields form={form} />
          <Form.Item name="baseAmount" label="基准定投金额（元）" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} step={500} />
          </Form.Item>
          {templateType === 'SMART_DCA_CHANGE' ? (
            <Form.Item
              name="referenceWindow"
              label="涨跌幅参考窗口（交易日）"
              rules={[{ required: true, type: 'number', min: 1 }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          ) : (
            <Form.Item
              name="maWindow"
              label="均线窗口（交易日，如 250≈年线）"
              rules={[{ required: true, type: 'number', min: 2 }]}
            >
              <InputNumber style={{ width: '100%' }} min={2} />
            </Form.Item>
          )}
          <Form.Item
            name="stepPct"
            label={
              templateType === 'SMART_DCA_CHANGE' ? '每档涨跌幅（%）' : '每档偏离均线幅度（%）'
            }
            tooltip="偏离每达到该幅度，按下方比例调整一档投入"
            rules={[{ required: true, type: 'number', min: 0.1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.1} step={1} addonAfter="%" />
          </Form.Item>
          <Form.Item
            name="adjustPct"
            label="每档调整比例（%）"
            tooltip="下跌/低于均线时加大投入、上涨/高于均线时减少投入的幅度"
            rules={[{ required: true, type: 'number', min: 0 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={5} addonAfter="%" />
          </Form.Item>
          <Form.Item name="minFactor" label="投入倍数下限" rules={[{ required: true, type: 'number', min: 0 }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
          </Form.Item>
          <Form.Item name="maxFactor" label="投入倍数上限" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} step={0.5} />
          </Form.Item>
        </>
      )}

      {templateType === 'VALUE_AVERAGING' && (
        <>
          <PeriodFields form={form} />
          <Form.Item
            name="targetStep"
            label="每期目标市值增长（元）"
            tooltip="第 k 期目标持仓市值 = 本值 × k；每期买卖使市值贴近目标，下跌自动多买、上涨少买/卖出"
            rules={[{ required: true, type: 'number', min: 1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} step={500} />
          </Form.Item>
          <Form.Item
            name="maxBuy"
            label="单期最大买入（元，0=不限）"
            tooltip="限制极端下跌时的单期买入额"
            rules={[{ required: true, type: 'number', min: 0 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={500} />
          </Form.Item>
          <Form.Item
            name="allowSell"
            label="市值超目标时卖出"
            tooltip="开启=高位卖出超出部分（标准目标市值法）；关闭=只买不卖"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </>
      )}

      {templateType === 'THRESHOLD_BUY' && (
        <>
          <Form.Item name="dropPct" label="跌幅阈值（%）" rules={[{ required: true, type: 'number', min: 0.1 }]}>
            <InputNumber style={{ width: '100%' }} min={0.1} step={1} addonAfter="%" />
          </Form.Item>
          <Form.Item name="window" label="观察窗口（交易日）" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item name="amount" label="买入金额（元）" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} step={500} />
          </Form.Item>
        </>
      )}

      {templateType === 'SMART_THRESHOLD_BUY_CHANGE' && (
        <>
          <Form.Item
            name="dropPct"
            label="跌幅触发阈值（%）"
            tooltip="近观察窗口跌幅达到该值起开始买入"
            rules={[{ required: true, type: 'number', min: 0.1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.1} step={1} addonAfter="%" />
          </Form.Item>
          <Form.Item name="window" label="观察窗口（交易日）" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item
            name="baseAmount"
            label="基准买入金额（元）"
            tooltip="达到阈值时买入的基准金额；跌幅越深按下方比例放大"
            rules={[{ required: true, type: 'number', min: 1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} step={500} />
          </Form.Item>
          <Form.Item
            name="stepPct"
            label="每档跌幅（%）"
            tooltip="超出阈值的跌幅每达到该幅度，按下方比例加码一档买入"
            rules={[{ required: true, type: 'number', min: 0.1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.1} step={1} addonAfter="%" />
          </Form.Item>
          <Form.Item
            name="adjustPct"
            label="每档加码比例（%）"
            tooltip="跌幅每多一档，买入金额增加的幅度（跌得越多买得越多）"
            rules={[{ required: true, type: 'number', min: 0 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={10} addonAfter="%" />
          </Form.Item>
          <Form.Item name="minFactor" label="买入倍数下限" rules={[{ required: true, type: 'number', min: 0 }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
          </Form.Item>
          <Form.Item name="maxFactor" label="买入倍数上限" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} step={0.5} />
          </Form.Item>
        </>
      )}

      {templateType === 'THRESHOLD_SELL' && (
        <>
          <Form.Item name="risePct" label="涨幅阈值（%）" rules={[{ required: true, type: 'number', min: 0.1 }]}>
            <InputNumber style={{ width: '100%' }} min={0.1} step={1} addonAfter="%" />
          </Form.Item>
          <Form.Item name="window" label="观察窗口（交易日）" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item
            name="amount"
            label="卖出金额（元）"
            tooltip="按成交净值换算份额卖出；持仓不足则全部卖出"
            rules={[{ required: true, type: 'number', min: 1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} step={500} />
          </Form.Item>
        </>
      )}

      {templateType === 'SMART_THRESHOLD_SELL_CHANGE' && (
        <>
          <Form.Item
            name="risePct"
            label="涨幅触发阈值（%）"
            tooltip="近观察窗口涨幅达到该值起开始卖出"
            rules={[{ required: true, type: 'number', min: 0.1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.1} step={1} addonAfter="%" />
          </Form.Item>
          <Form.Item name="window" label="观察窗口（交易日）" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item
            name="baseAmount"
            label="基准卖出金额（元）"
            tooltip="达到阈值时卖出的基准金额；涨幅越高按下方比例放大"
            rules={[{ required: true, type: 'number', min: 1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} step={500} />
          </Form.Item>
          <Form.Item
            name="stepPct"
            label="每档涨幅（%）"
            tooltip="超出阈值的涨幅每达到该幅度，按下方比例加码一档卖出"
            rules={[{ required: true, type: 'number', min: 0.1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.1} step={1} addonAfter="%" />
          </Form.Item>
          <Form.Item
            name="adjustPct"
            label="每档加码比例（%）"
            tooltip="涨幅每上一档，卖出金额增加的幅度（涨得越多卖得越多）"
            rules={[{ required: true, type: 'number', min: 0 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={10} addonAfter="%" />
          </Form.Item>
          <Form.Item name="minFactor" label="卖出倍数下限" rules={[{ required: true, type: 'number', min: 0 }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
          </Form.Item>
          <Form.Item name="maxFactor" label="卖出倍数上限" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} step={0.5} />
          </Form.Item>
        </>
      )}

      {templateType === 'TAKE_PROFIT' && (
        <>
          <Form.Item name="gainPct" label="止盈收益率（%）" rules={[{ required: true, type: 'number', min: 0.1 }]}>
            <InputNumber style={{ width: '100%' }} min={0.1} step={5} addonAfter="%" />
          </Form.Item>
          <Form.Item name="sellRatio" label="卖出比例（%）" rules={[{ required: true, type: 'number', min: 1, max: 100 }]}>
            <InputNumber style={{ width: '100%' }} min={1} max={100} addonAfter="%" />
          </Form.Item>
        </>
      )}

      {templateType === 'SMART_TAKE_PROFIT' && (
        <>
          <Form.Item
            name="startGainPct"
            label="起始止盈收益率（%）"
            tooltip="收益率达到该值开始分档止盈"
            rules={[{ required: true, type: 'number', min: 0.1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.1} step={5} addonAfter="%" />
          </Form.Item>
          <Form.Item
            name="stepPct"
            label="每档收益率间隔（%）"
            tooltip="收益每多涨该幅度，进入更高一档、加码卖出"
            rules={[{ required: true, type: 'number', min: 0.1 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.1} step={5} addonAfter="%" />
          </Form.Item>
          <Form.Item
            name="stepSellRatio"
            label="每档卖出比例（%）"
            tooltip="每上一档按当前剩余份额卖出的比例（收益越高卖越多）"
            rules={[{ required: true, type: 'number', min: 1, max: 100 }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} max={100} addonAfter="%" />
          </Form.Item>
          <Form.Item
            name="maxSellRatio"
            label="单次卖出比例上限（%）"
            rules={[{ required: true, type: 'number', min: 1, max: 100 }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} max={100} addonAfter="%" />
          </Form.Item>
        </>
      )}

      {templateType === 'STOP_LOSS' && (
        <>
          <Form.Item name="lossPct" label="止损跌幅（%）" rules={[{ required: true, type: 'number', min: 0.1 }]}>
            <InputNumber style={{ width: '100%' }} min={0.1} step={5} addonAfter="%" />
          </Form.Item>
          <Form.Item name="sellRatio" label="卖出比例（%）" rules={[{ required: true, type: 'number', min: 1, max: 100 }]}>
            <InputNumber style={{ width: '100%' }} min={1} max={100} addonAfter="%" />
          </Form.Item>
        </>
      )}

      {templateType === 'GRID' && (
        <>
          <Form.Item name="lower" label="网格下界（净值）" rules={[{ required: true, type: 'number', min: 0.01 }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={0.1} />
          </Form.Item>
          <Form.Item name="upper" label="网格上界（净值）" rules={[{ required: true, type: 'number', min: 0.02 }]}>
            <InputNumber style={{ width: '100%' }} min={0.02} step={0.1} />
          </Form.Item>
          <Form.Item name="grids" label="网格层数" rules={[{ required: true, type: 'number', min: 2 }]}>
            <InputNumber style={{ width: '100%' }} min={2} />
          </Form.Item>
          <Form.Item name="perGridAmount" label="每格金额（元）" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} step={500} />
          </Form.Item>
        </>
      )}

      <div style={{ textAlign: 'right', marginTop: 8 }}>
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleOk}>
            确定
          </Button>
        </Space>
      </div>
    </Form>
  );
}
