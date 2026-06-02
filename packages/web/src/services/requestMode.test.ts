import { describe, it, expect, beforeEach } from 'vitest';
import { mapRequests, setSequentialRequests, isSequentialRequests } from './requestMode';

beforeEach(() => setSequentialRequests(true));

describe('requestMode', () => {
  it('默认顺序模式', () => {
    expect(isSequentialRequests()).toBe(true);
  });

  it('顺序模式：逐个执行（一次一只），保留输入顺序', async () => {
    setSequentialRequests(true);
    let concurrent = 0;
    let maxConcurrent = 0;
    const fn = async (n: number) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return n * 2;
    };
    const res = await mapRequests([1, 2, 3], fn);
    expect(res).toEqual([2, 4, 6]);
    expect(maxConcurrent).toBe(1); // 顺序：任意时刻最多 1 个在执行
  });

  it('并发模式：同时执行，仍保留输入顺序', async () => {
    setSequentialRequests(false);
    let concurrent = 0;
    let maxConcurrent = 0;
    const fn = async (n: number) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return n * 2;
    };
    const res = await mapRequests([1, 2, 3], fn);
    expect(res).toEqual([2, 4, 6]);
    expect(maxConcurrent).toBeGreaterThan(1); // 并发：存在同时执行
  });

  it('空数组返回空', async () => {
    expect(await mapRequests([], async (x) => x)).toEqual([]);
  });
});
