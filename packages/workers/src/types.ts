/** Workers 运行时环境绑定 */
export interface Env {
  /** 允许的前端来源，逗号分隔 */
  ALLOWED_ORIGINS: string;
  /** KV 缓存命名空间（可选，部署时绑定） */
  FUND_CACHE?: KVNamespace;
}
