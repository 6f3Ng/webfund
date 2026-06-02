import { useState } from 'react';
import { Button, Popover, Checkbox, Space, Typography, Tooltip } from 'antd';
import { SettingOutlined, HolderOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  HOLDINGS_COLUMN_META,
  defaultPrefs,
  moveColumn,
  normalizeOrder,
  type HoldingsColumnKey,
  type HoldingsColumnPrefs,
} from '@/utils/holdingsColumns';

const META_BY_KEY = new Map(HOLDINGS_COLUMN_META.map((m) => [m.key, m]));

interface Props {
  prefs: HoldingsColumnPrefs;
  onChange: (prefs: HoldingsColumnPrefs) => void;
}

/**
 * 持仓明细列设置：拖拽调整列顺序 + 勾选显隐。
 * 使用原生 HTML5 拖放（无额外依赖），偏好变更通过 onChange 上抛由父级持久化。
 */
export function HoldingsColumnSettings({ prefs, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [dragKey, setDragKey] = useState<HoldingsColumnKey | null>(null);

  const order = normalizeOrder(prefs.order);
  const hidden = new Set(prefs.hidden);

  const toggleHidden = (key: HoldingsColumnKey, checked: boolean) => {
    const next = new Set(hidden);
    if (checked) next.delete(key);
    else next.add(key);
    onChange({ order, hidden: [...next] });
  };

  const handleDrop = (toKey: HoldingsColumnKey, fromKeyFromDt?: string) => {
    // 优先用 dataTransfer 携带的源 key（不依赖 React 状态的异步更新，便于稳定触发）
    const fromKey = (fromKeyFromDt as HoldingsColumnKey) || dragKey;
    if (!fromKey || fromKey === toKey) return;
    onChange({ order: moveColumn(order, fromKey, toKey), hidden: [...hidden] });
    setDragKey(null);
  };

  const content = (
    <div style={{ width: 240 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          拖动排序 · 勾选显隐
        </Typography.Text>
        <Button
          type="link"
          size="small"
          icon={<ReloadOutlined />}
          style={{ padding: 0 }}
          onClick={() => onChange(defaultPrefs())}
        >
          重置
        </Button>
      </Space>
      <div>
        {order.map((key) => {
          const meta = META_BY_KEY.get(key)!;
          const visible = !hidden.has(key);
          return (
            <div
              key={key}
              draggable
              onDragStart={(e) => {
                setDragKey(key);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', key);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(key, e.dataTransfer.getData('text/plain'));
              }}
              onDragEnd={() => setDragKey(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 4px',
                borderRadius: 4,
                cursor: 'move',
                background: dragKey === key ? '#e6f4ff' : 'transparent',
                border: '1px solid transparent',
              }}
            >
              <HolderOutlined style={{ color: '#bfbfbf' }} />
              <Checkbox
                checked={visible}
                disabled={!meta.canHide}
                onChange={(e) => toggleHidden(key, e.target.checked)}
              >
                {meta.label}
              </Checkbox>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      title="列设置"
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Tooltip title="自定义列（顺序/显隐）">
        <Button size="small" icon={<SettingOutlined />}>
          列设置
        </Button>
      </Tooltip>
    </Popover>
  );
}
