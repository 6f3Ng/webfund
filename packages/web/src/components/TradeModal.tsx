import { useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, App } from 'antd';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useFundNames } from '@/hooks/useFundNames';
import type { Position } from '@fund/core';

export type TradeType = 'BUY' | 'SELL' | 'CONVERT';

interface TradeModalProps {
  open: boolean;
  type: TradeType;
  positions: Position[];
  /** 预填基金代码（卖出/转换时） */
  presetFundCode?: string;
  onClose: () => void;
}

const TITLES: Record<TradeType, string> = { BUY: '买入', SELL: '卖出', CONVERT: '转换' };

export function TradeModal({ open, type, positions, presetFundCode, onClose }: TradeModalProps) {
  const { message } = App.useApp();
  const [antdForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { buy, sell, convert } = usePortfolioStore();
  const { resolve } = useFundNames(positions.map((p) => p.fundCode));

  const handleOk = async () => {
    try {
      const values = await antdForm.validateFields();
      setSubmitting(true);
      if (type === 'BUY') {
        await buy({ fundCode: values.fundCode.trim(), amount: values.amount });
      } else if (type === 'SELL') {
        await sell({ fundCode: values.fundCode, shares: values.shares });
      } else {
        await convert({
          fromFundCode: values.fromFundCode,
          toFundCode: values.toFundCode.trim(),
          shares: values.shares,
        });
      }
      message.success(`${TITLES[type]}已提交`);
      antdForm.resetFields();
      onClose();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const positionOptions = positions
    .filter((p) => p.availableShares > 0)
    .map((p) => {
      const nm = resolve(p.fundCode);
      const label = nm && nm !== p.fundCode ? `${nm}（${p.fundCode}）` : p.fundCode;
      return {
        label: `${label}｜可卖 ${p.availableShares.toFixed(2)} 份`,
        value: p.fundCode,
      };
    });

  return (
    <Modal
      title={`${TITLES[type]}基金`}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={submitting}
      destroyOnHidden
    >
      <Form form={antdForm} layout="vertical" preserve={false}>
        {type === 'BUY' && (
          <>
            <Form.Item
              name="fundCode"
              label="基金代码"
              rules={[{ required: true, pattern: /^\d{6}$/, message: '请输入 6 位基金代码' }]}
            >
              <Input placeholder="如 000001" maxLength={6} />
            </Form.Item>
            <Form.Item
              name="amount"
              label="买入金额（元）"
              rules={[{ required: true, type: 'number', min: 1, message: '金额需大于 0' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} step={1000} placeholder="如 10000" />
            </Form.Item>
          </>
        )}

        {type === 'SELL' && (
          <>
            <Form.Item
              name="fundCode"
              label="选择持仓"
              initialValue={presetFundCode}
              rules={[{ required: true, message: '请选择要卖出的基金' }]}
            >
              <Select options={positionOptions} placeholder="选择持仓基金" />
            </Form.Item>
            <Form.Item
              name="shares"
              label="卖出份额"
              rules={[{ required: true, type: 'number', min: 0.0001, message: '份额需大于 0' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0.0001} step={100} />
            </Form.Item>
          </>
        )}

        {type === 'CONVERT' && (
          <>
            <Form.Item
              name="fromFundCode"
              label="转出基金"
              initialValue={presetFundCode}
              rules={[{ required: true, message: '请选择转出基金' }]}
            >
              <Select options={positionOptions} placeholder="选择转出基金" />
            </Form.Item>
            <Form.Item
              name="toFundCode"
              label="转入基金代码"
              rules={[{ required: true, pattern: /^\d{6}$/, message: '请输入 6 位基金代码' }]}
            >
              <Input placeholder="如 110011" maxLength={6} />
            </Form.Item>
            <Form.Item
              name="shares"
              label="转换份额"
              rules={[{ required: true, type: 'number', min: 0.0001, message: '份额需大于 0' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0.0001} step={100} />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
