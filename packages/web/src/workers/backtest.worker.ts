/// <reference lib="webworker" />
import { runBacktest, type BacktestInput, type BacktestResult } from '@fund/core';

export interface BacktestRequest {
  id: number;
  input: BacktestInput;
}
export interface BacktestResponse {
  id: number;
  ok: boolean;
  result?: BacktestResult;
  error?: string;
}

self.onmessage = (e: MessageEvent<BacktestRequest>) => {
  const { id, input } = e.data;
  try {
    const result = runBacktest(input);
    const response: BacktestResponse = { id, ok: true, result };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: BacktestResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
