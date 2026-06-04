import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchText, fetchJson, UpstreamError } from './fetch';

function mockResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `STATUS_${status}`,
    text: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchText 重试', () => {
  it('瞬时错误（429）重试后成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(429, 'rate limited'))
      .mockResolvedValueOnce(mockResponse(200, 'OK'));
    vi.stubGlobal('fetch', fetchMock);

    const text = await fetchText('https://x.test/', { retries: 2, retryBaseMs: 1 });
    expect(text).toBe('OK');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('5xx 重试耗尽后抛 UpstreamError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(503, 'down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchText('https://x.test/', { retries: 2, retryBaseMs: 1 })).rejects.toThrow(
      UpstreamError,
    );
    // 初次 + 2 次重试 = 3
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('非瞬时错误（404）不重试，立即抛出', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(404, 'not found'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchText('https://x.test/', { retries: 3, retryBaseMs: 1 })).rejects.toThrow(
      UpstreamError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('网络层失败（throw）按 502 重试', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(mockResponse(200, 'OK'));
    vi.stubGlobal('fetch', fetchMock);

    const text = await fetchText('https://x.test/', { retries: 2, retryBaseMs: 1 });
    expect(text).toBe('OK');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchJson', () => {
  it('解析 JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(200, '{"a":1}')));
    expect(await fetchJson<{ a: number }>('https://x.test/', { retries: 0 })).toEqual({ a: 1 });
  });

  it('非 JSON 抛 UpstreamError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(200, 'not json')));
    await expect(fetchJson('https://x.test/', { retries: 0 })).rejects.toThrow(UpstreamError);
  });
});
