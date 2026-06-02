import type { BacktestInput, BacktestResult, NavPoint, Strategy } from '@fund/core';
import { fetchHistory } from '@/api/funds';
import { mapRequests } from '@/services/requestMode';
import type { BacktestRequest, BacktestResponse } from '@/workers/backtest.worker';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: BacktestResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/backtest.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<BacktestResponse>) => {
      const { id, ok, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok && result) p.resolve(result);
      else p.reject(new Error(error ?? '回测失败'));
    };
  }
  return worker;
}

/** 拉取所有标的基金的历史净值（按设置顺序/并发调用，规避限流） */
export async function loadNavData(
  fundCodes: string[],
  start: string,
  end: string,
): Promise<Record<string, NavPoint[]>> {
  const entries = await mapRequests(fundCodes, async (code) => {
    const { points } = await fetchHistory(code, start, end);
    return [code, points as NavPoint[]] as const;
  });
  return Object.fromEntries(entries);
}

/** 在 Web Worker 中运行回测 */
export function runBacktestInWorker(input: BacktestInput): Promise<BacktestResult> {
  const id = ++seq;
  const req: BacktestRequest = { id, input };
  return new Promise<BacktestResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage(req);
  });
}

/** 收集策略集涉及的所有标的基金代码 */
export function collectFundCodes(strategies: Strategy[]): string[] {
  return [...new Set(strategies.map((s) => s.fundCode))];
}
