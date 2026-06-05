import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiGet, ApiRequestError } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `STATUS_${status}`,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiGet 瞬时错误重试', () => {
  it('限流 429 后重试成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { ok: false, error: { code: 'RATE_LIMITED', message: '限流' } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: { v: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await apiGet<{ v: number }>('/test', undefined, { retries: 3, retryBaseMs: 1 });
    expect(data).toEqual({ v: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('上游 502 重试后成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { ok: false, error: { code: 'UPSTREAM_ERROR', message: '上游' } }))
      .mockResolvedValueOnce(jsonResponse(502, { ok: false, error: { code: 'UPSTREAM_ERROR', message: '上游' } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await apiGet<string>('/test', undefined, { retries: 3, retryBaseMs: 1 });
    expect(data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('重试耗尽后抛 ApiRequestError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(429, { ok: false, error: { code: 'RATE_LIMITED', message: '限流' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/test', undefined, { retries: 2, retryBaseMs: 1 })).rejects.toThrow(
      ApiRequestError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3); // 初次 + 2 次重试
  });

  it('非瞬时错误（400）不重试，立即抛出', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { ok: false, error: { code: 'BAD_REQUEST', message: '参数错误' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/test', undefined, { retries: 3, retryBaseMs: 1 })).rejects.toThrow(
      ApiRequestError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
