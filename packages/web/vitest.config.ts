import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // 设置非 opaque origin，使 jsdom 提供可用的 localStorage（供 portfolioStore 经
    // LocalStorageAdapter 的测试在用例间 clear 状态）。
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    // 兜底安装内存版 localStorage 并在每个用例前清空（见 vitest.setup.ts）。
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // 基建任务先于测试文件落地，无 .test 文件时仍以成功退出（供检查点命令执行）。
    passWithNoTests: true,
  },
});
