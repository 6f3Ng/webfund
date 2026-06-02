import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 本地开发时把 /api 代理到 wrangler dev（默认 8787）
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        // workers 未启动时优雅降级：打印一次清晰提示并返回结构化错误，
        // 避免控制台刷出 ECONNREFUSED 堆栈、且前端能正常展示「行情获取失败」。
        configure: (proxy) => {
          let warned = false;
          proxy.on('error', (err, _req, res) => {
            if (!warned) {
              console.warn(
                '\n[api proxy] 无法连接本地 Workers (http://localhost:8787)。' +
                  '请在另一个终端运行 `pnpm dev:workers` 以提供 /api 接口。\n',
              );
              warned = true;
            }
            const r = res as import('node:http').ServerResponse | undefined;
            if (r && 'writableEnded' in r && !r.writableEnded) {
              if (!r.headersSent) {
                r.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
              }
              r.end(
                JSON.stringify({
                  ok: false,
                  error: { code: 'WORKERS_OFFLINE', message: '本地 Workers 未启动（请运行 pnpm dev:workers）', detail: err.message },
                }),
              );
            }
          });
        },
      },
    },
  },
});
