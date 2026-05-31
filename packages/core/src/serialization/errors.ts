/** 导入/解码错误类型 */
export type ImportErrorCode =
  | 'BAD_HEADER' // magic header 不匹配
  | 'DECODE_FAILED' // base64/解压/JSON 解析失败
  | 'VALIDATION_FAILED' // schema 字段校验失败
  | 'UNSUPPORTED_VERSION'; // 版本无法迁移

export class ImportError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}
