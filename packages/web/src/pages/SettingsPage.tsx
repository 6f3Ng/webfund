import { Card, Form, Select, Switch, InputNumber, Slider, Typography, Space } from 'antd';
import { VALUATION_SOURCES, type ValuationSourceId } from '@fund/core';
import { useSettingsStore } from '@/stores/settingsStore';

export function SettingsPage() {
  const { settings, update } = useSettingsStore();

  return (
    <Card title="设置">
      <Form layout="vertical" style={{ maxWidth: 520 }}>
        <Form.Item label="默认估值数据源">
          <Select
            value={settings.defaultValuationSource}
            onChange={(v) => update({ defaultValuationSource: v as ValuationSourceId })}
            options={VALUATION_SOURCES.map((s) => ({
              label: `${s.name} — ${s.description}`,
              value: s.id,
            }))}
          />
        </Form.Item>

        <Form.Item label="交易时段自动刷新估值">
          <Switch checked={settings.autoRefresh} onChange={(v) => update({ autoRefresh: v })} />
        </Form.Item>

        <Form.Item label={`自动刷新间隔：${settings.refreshIntervalSec} 秒`}>
          <Slider
            min={15}
            max={300}
            step={15}
            value={settings.refreshIntervalSec}
            onChange={(v) => update({ refreshIntervalSec: v })}
            disabled={!settings.autoRefresh}
          />
        </Form.Item>

        <Form.Item label="默认申购费率（A 类基金）">
          <Space>
            <InputNumber
              min={0}
              max={0.05}
              step={0.001}
              value={settings.defaultPurchaseFeeRate}
              onChange={(v) => update({ defaultPurchaseFeeRate: v ?? 0.015 })}
            />
            <Typography.Text type="secondary">
              {(settings.defaultPurchaseFeeRate * 100).toFixed(2)}%（前端收费，外扣）
            </Typography.Text>
          </Space>
        </Form.Item>

        <Form.Item label="申购费率（C 类基金）">
          <Space>
            <InputNumber
              min={0}
              max={0.05}
              step={0.001}
              value={settings.defaultPurchaseFeeRateC}
              onChange={(v) => update({ defaultPurchaseFeeRateC: v ?? 0 })}
            />
            <Typography.Text type="secondary">
              {(settings.defaultPurchaseFeeRateC * 100).toFixed(2)}%（C 类通常免申购费，改收销售服务费）
            </Typography.Text>
          </Space>
        </Form.Item>

        <Form.Item label="默认赎回费率（A 类基金）">
          <Space>
            <InputNumber
              min={0}
              max={0.05}
              step={0.001}
              value={settings.defaultRedeemFeeRate}
              onChange={(v) => update({ defaultRedeemFeeRate: v ?? 0.005 })}
            />
            <Typography.Text type="secondary">
              {(settings.defaultRedeemFeeRate * 100).toFixed(2)}%（卖出时按成交金额收取）
            </Typography.Text>
          </Space>
        </Form.Item>

        <Form.Item label="赎回费率（C 类基金）">
          <Space>
            <InputNumber
              min={0}
              max={0.05}
              step={0.001}
              value={settings.defaultRedeemFeeRateC}
              onChange={(v) => update({ defaultRedeemFeeRateC: v ?? 0.005 })}
            />
            <Typography.Text type="secondary">
              {(settings.defaultRedeemFeeRateC * 100).toFixed(2)}%（C 类赎回费，按成交金额收取）
            </Typography.Text>
          </Space>
        </Form.Item>

        <Form.Item label="多基金接口请求方式">
          <Space>
            <Switch
              checkedChildren="顺序"
              unCheckedChildren="并发"
              checked={settings.sequentialRequests}
              onChange={(v) => update({ sequentialRequests: v })}
            />
            <Typography.Text type="secondary">
              {settings.sequentialRequests
                ? '顺序调用（每只基金的行情/信息并行、不同基金间逐只串行，规避第三方接口 429 限流，推荐）'
                : '并发调用（所有基金同时请求，更快，持仓基金较多时可能触发限流）'}
            </Typography.Text>
          </Space>
        </Form.Item>

        <Typography.Paragraph type="secondary">
          说明：模拟交易遵循场外基金标准规则（15:00 前按当日净值、份额 T+1 可卖、资金 T+N 到账）。
          估值数据来自公开网络，非官方推算，仅供参考。
        </Typography.Paragraph>
      </Form>
    </Card>
  );
}
