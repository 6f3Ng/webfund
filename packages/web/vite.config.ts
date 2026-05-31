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
      },
    },
  },
});
