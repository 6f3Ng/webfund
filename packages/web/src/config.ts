/** 应用配置。开发时 /api 由 Vite 代理到本地 Workers；生产由 Pages 路由或绝对地址。 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

export const APP_NAME = '基金模拟投资助手';

/** 全局合规提示 */
export const COMPLIANCE_NOTICE =
  '本工具数据来自公开网络、估值为非官方推算，仅供学习与模拟参考，不构成任何投资建议。';
