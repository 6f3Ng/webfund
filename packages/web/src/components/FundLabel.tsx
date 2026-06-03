import { Space } from 'antd';

interface FundLabelProps {
  /** 基金代码（6 位） */
  code: string;
  /** 解析后的基金名称（不传或与代码相同时仅展示代码） */
  name?: string;
  /** 转换类：目标基金代码 */
  targetCode?: string;
  /** 转换类：目标基金名称 */
  targetName?: string;
}

/** 单只基金的「名称 + 代码」双行展示（名称在上、灰色 6 位代码在下）。 */
export function FundLabel({ code, name }: { code: string; name?: string }) {
  const display = name && name !== code ? name : code;
  return (
    <Space direction="vertical" size={0}>
      <span>{display}</span>
      {display !== code && <span style={{ fontSize: 12, color: '#999' }}>{code}</span>}
    </Space>
  );
}

/**
 * 基金「名称 + 代码」双展示，支持转换的「源 → 目标」（需求 4）。
 * 普通基金两行展示；转换类横向展示「源名称(代码) → 目标名称(代码)」。
 */
export function FundCell({ code, name, targetCode, targetName }: FundLabelProps) {
  if (targetCode) {
    const src = name && name !== code ? `${name}(${code})` : code;
    const dst = targetName && targetName !== targetCode ? `${targetName}(${targetCode})` : targetCode;
    return (
      <span>
        {src} → {dst}
      </span>
    );
  }
  return <FundLabel code={code} name={name} />;
}
