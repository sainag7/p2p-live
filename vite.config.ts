import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { previewCaching } from './utils/previewCaching';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Prefer an explicit proxy target (e.g. production Render). Otherwise use the local API.
  const apiTarget =
    env.VITE_API_PROXY_TARGET?.trim() || 'http://localhost:3001';
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      // When VITE_API_BASE_URL is empty, the client calls same-origin /api/* and Vite proxies here.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, secure: true },
      },
    },
    plugins: [react(), previewCaching()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
