import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: { sourcemap: 'hidden' },
  preview: {
    proxy: {
      '/api': { target: 'http://localhost:8888', changeOrigin: true },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['mdh0atwwji.app.orbitproxy.cloud'],
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@weils-monitor/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
      '@weils-monitor/utils': fileURLToPath(
        new URL('../../packages/utils/src/index.ts', import.meta.url),
      ),
      '@weils-monitor/vue': fileURLToPath(
        new URL('../../packages/vue/src/index.ts', import.meta.url),
      ),
    },
  },
});
