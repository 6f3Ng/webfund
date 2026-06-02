/**
 * 持仓明细列配置（列顺序 + 显隐）的纯助手与本地持久化。
 *
 * 列的渲染/排序逻辑仍在 HomePage 内（需闭包运行时数据），此处仅维护：
 * - 列元信息（key/默认标签/是否可隐藏）与默认顺序；
 * - 用户偏好（顺序 + 隐藏集）的规整与 localStorage 读写。
 *
 * 纯函数 + 受控 IO，便于单元测试。
 */

/** 持仓明细列 key（与 HomePage 列定义一致）。dayProfit 默认紧随 growth。 */
export type HoldingsColumnKey =
  | 'fund'
  | 'nav'
  | 'growth'
  | 'dayProfit'
  | 'shares'
  | 'availableShares'
  | 'costPrice'
  | 'cost'
  | 'mv'
  | 'profit'
  | 'action';

export interface HoldingsColumnMeta {
  key: HoldingsColumnKey;
  /** 列设置面板展示用的静态标签（HomePage 实际表头可随估值时段动态变化） */
  label: string;
  /** 是否允许隐藏（基金/操作列为关键列，固定展示） */
  canHide: boolean;
}

/** 列元信息（数组顺序即默认列顺序）：当日收益(dayProfit) 紧随 当日涨跌(growth) 右侧。 */
export const HOLDINGS_COLUMN_META: HoldingsColumnMeta[] = [
  { key: 'fund', label: '基金', canHide: false },
  { key: 'nav', label: '净值/估值', canHide: true },
  { key: 'growth', label: '当日涨跌/估算涨跌', canHide: true },
  { key: 'dayProfit', label: '当日收益/估算收益', canHide: true },
  { key: 'shares', label: '持有份额', canHide: true },
  { key: 'availableShares', label: '可卖份额', canHide: true },
  { key: 'costPrice', label: '成本单价', canHide: true },
  { key: 'cost', label: '成本', canHide: true },
  { key: 'mv', label: '市值', canHide: true },
  { key: 'profit', label: '收益', canHide: true },
  { key: 'action', label: '操作', canHide: false },
];

export const DEFAULT_COLUMN_ORDER: HoldingsColumnKey[] = HOLDINGS_COLUMN_META.map((m) => m.key);

const ALL_KEYS = new Set<HoldingsColumnKey>(DEFAULT_COLUMN_ORDER);
const META_BY_KEY = new Map(HOLDINGS_COLUMN_META.map((m) => [m.key, m]));

/** 用户列偏好：顺序 + 隐藏列。 */
export interface HoldingsColumnPrefs {
  order: HoldingsColumnKey[];
  hidden: HoldingsColumnKey[];
}

export const HOLDINGS_COLUMNS_STORAGE_KEY = 'fund.holdingsColumns';

/**
 * 规整列顺序：过滤非法 key、去重，并把缺失的列（如版本升级新增）按默认顺序补到末尾。
 * 保证返回值恰为全部列的一个排列。
 */
export function normalizeOrder(order: unknown): HoldingsColumnKey[] {
  const seen = new Set<HoldingsColumnKey>();
  const result: HoldingsColumnKey[] = [];
  if (Array.isArray(order)) {
    for (const k of order) {
      if (ALL_KEYS.has(k as HoldingsColumnKey) && !seen.has(k as HoldingsColumnKey)) {
        seen.add(k as HoldingsColumnKey);
        result.push(k as HoldingsColumnKey);
      }
    }
  }
  for (const k of DEFAULT_COLUMN_ORDER) {
    if (!seen.has(k)) result.push(k);
  }
  return result;
}

/** 规整隐藏集：仅保留合法、可隐藏的列 key。 */
export function normalizeHidden(hidden: unknown): HoldingsColumnKey[] {
  if (!Array.isArray(hidden)) return [];
  const out: HoldingsColumnKey[] = [];
  const seen = new Set<HoldingsColumnKey>();
  for (const k of hidden) {
    const key = k as HoldingsColumnKey;
    if (ALL_KEYS.has(key) && META_BY_KEY.get(key)?.canHide && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/** 规整完整偏好。 */
export function normalizePrefs(raw: unknown): HoldingsColumnPrefs {
  const obj = (raw ?? {}) as Partial<HoldingsColumnPrefs>;
  return {
    order: normalizeOrder(obj.order),
    hidden: normalizeHidden(obj.hidden),
  };
}

/** 默认偏好（全列默认顺序、无隐藏）。 */
export function defaultPrefs(): HoldingsColumnPrefs {
  return { order: [...DEFAULT_COLUMN_ORDER], hidden: [] };
}

/** 从 localStorage 读取列偏好（失败/缺失回退默认）。 */
export function loadColumnPrefs(): HoldingsColumnPrefs {
  try {
    const raw = localStorage.getItem(HOLDINGS_COLUMNS_STORAGE_KEY);
    if (!raw) return defaultPrefs();
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return defaultPrefs();
  }
}

/** 写入列偏好（规整后存储）。 */
export function saveColumnPrefs(prefs: HoldingsColumnPrefs): void {
  try {
    localStorage.setItem(HOLDINGS_COLUMNS_STORAGE_KEY, JSON.stringify(normalizePrefs(prefs)));
  } catch {
    // 忽略写入失败（如隐私模式）
  }
}

/** 在有序列表中把 fromKey 移动到 toKey 之前（拖拽排序用，纯函数）。 */
export function moveColumn(
  order: HoldingsColumnKey[],
  fromKey: HoldingsColumnKey,
  toKey: HoldingsColumnKey,
): HoldingsColumnKey[] {
  if (fromKey === toKey) return order;
  const from = order.indexOf(fromKey);
  const to = order.indexOf(toKey);
  if (from < 0 || to < 0) return order;
  const next = [...order];
  next.splice(from, 1);
  // 删除 from 后重新计算 to 的位置
  const insertAt = next.indexOf(toKey);
  next.splice(insertAt, 0, fromKey);
  return next;
}

/** 计算最终展示的列 key 序列（按顺序、剔除隐藏）。 */
export function visibleOrderedKeys(prefs: HoldingsColumnPrefs): HoldingsColumnKey[] {
  const hidden = new Set(prefs.hidden);
  return normalizeOrder(prefs.order).filter((k) => !hidden.has(k));
}
