import { describe, it, expect } from 'vitest';
import { allowRequest } from './rate-limit';

describe('rate-limit 令牌桶', () => {
  it('容量内放行，超出限流', () => {
    const key = 'test-key-' + Math.random();
    const opts = { capacity: 3, refillPerSec: 0 };
    expect(allowRequest(key, opts)).toBe(true);
    expect(allowRequest(key, opts)).toBe(true);
    expect(allowRequest(key, opts)).toBe(true);
    // 第 4 次超出容量
    expect(allowRequest(key, opts)).toBe(false);
  });

  it('不同 key 独立计数', () => {
    const opts = { capacity: 1, refillPerSec: 0 };
    const k1 = 'k1-' + Math.random();
    const k2 = 'k2-' + Math.random();
    expect(allowRequest(k1, opts)).toBe(true);
    expect(allowRequest(k2, opts)).toBe(true);
    expect(allowRequest(k1, opts)).toBe(false);
  });

  it('默认参数可从容支撑多基金 fan-out 突发（不误伤合法请求）', () => {
    // 模拟 ~50 只基金 fan-out 的一轮突发：默认桶应全部放行
    const key = 'burst-' + Math.random();
    let allowed = 0;
    for (let i = 0; i < 50; i++) {
      if (allowRequest(key)) allowed++;
    }
    expect(allowed).toBe(50);
  });
});
