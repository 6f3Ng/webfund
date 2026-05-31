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

        <Form.Item label="默认申购费率">
          <Space>
            <InputNumber
              min={0}
              max={0.05}
              step={0.001}
              value={settings.defaultPurchaseFeeRate}
              onChange={(v) => update({ defaultPurchaseFeeRate: v ?? 0.015 })}
            />
            <Typography.Text type="secondary">
              {(settings.defaultPurchaseFeeRate * 100).toFixed(2)}%（外扣）
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
