import { describe, it, expect } from 'vitest';
import { mapLimit } from './concurrency';

describe('mapLimit', () => {
  it('保留输入顺序', async () => {
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it('并发不超过 limit', async () => {
    let active = 0;
    let maxActive = 0;
    await mapLimit([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return 0;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(maxActive).toBeGreaterThan(0);
  });

  it('空数组返回空', async () => {
    expect(await mapLimit([], 3, async () => 1)).toEqual([]);
  });

  it('limit 大于长度时不报错', async () => {
    const out = await mapLimit([1, 2], 10, async (n) => n + 1);
    expect(out).toEqual([2, 3]);
  });
});
