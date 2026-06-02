import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COLUMN_ORDER,
  normalizeOrder,
  normalizeHidden,
  normalizePrefs,
  moveColumn,
  visibleOrderedKeys,
  type HoldingsColumnKey,
} from './holdingsColumns';

describe('holdingsColumns 默认顺序', () => {
  it('当日收益(dayProfit) 紧随 当日涨跌(growth) 右侧', () => {
    const gi = DEFAULT_COLUMN_ORDER.indexOf('growth');
    const di = DEFAULT_COLUMN_ORDER.indexOf('dayProfit');
    expect(di).toBe(gi + 1);
  });
});

describe('normalizeOrder', () => {
  it('过滤非法 key、去重，并补齐缺失列到末尾', () => {
    const res = normalizeOrder(['profit', 'profit', 'xxx', 'fund']);
    // 去重后保留 profit, fund，其余按默认顺序补齐
    expect(res.slice(0, 2)).toEqual(['profit', 'fund']);
    expect([...res].sort()).toEqual([...DEFAULT_COLUMN_ORDER].sort());
    expect(res).toHaveLength(DEFAULT_COLUMN_ORDER.length);
  });

  it('非数组输入回退完整默认顺序', () => {
    expect(normalizeOrder(undefined)).toEqual(DEFAULT_COLUMN_ORDER);
    expect(normalizeOrder('bad')).toEqual(DEFAULT_COLUMN_ORDER);
  });
});

describe('normalizeHidden', () => {
  it('仅保留合法且可隐藏的列', () => {
    // fund/action 不可隐藏，xxx 非法
    const res = normalizeHidden(['fund', 'action', 'xxx', 'cost', 'cost']);
    expect(res).toEqual(['cost']);
  });
});

describe('moveColumn', () => {
  it('把列移动到目标列之前', () => {
    const order: HoldingsColumnKey[] = ['fund', 'nav', 'growth', 'dayProfit', 'profit'];
    // 把 profit 移到 nav 之前
    expect(moveColumn(order, 'profit', 'nav')).toEqual(['fund', 'profit', 'nav', 'growth', 'dayProfit']);
  });

  it('相同 key 或不存在时原样返回', () => {
    const order: HoldingsColumnKey[] = ['fund', 'nav'];
    expect(moveColumn(order, 'nav', 'nav')).toEqual(order);
    expect(moveColumn(order, 'cost', 'nav')).toEqual(order);
  });
});

describe('visibleOrderedKeys', () => {
  it('按顺序剔除隐藏列', () => {
    const prefs = normalizePrefs({ order: ['fund', 'growth', 'dayProfit', 'nav'], hidden: ['nav'] });
    const vis = visibleOrderedKeys(prefs);
    expect(vis.includes('nav')).toBe(false);
    // 前三列顺序保持
    expect(vis.slice(0, 3)).toEqual(['fund', 'growth', 'dayProfit']);
  });
});
