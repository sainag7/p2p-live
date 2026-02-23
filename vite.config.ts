import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GEMINI_API_KEY must NEVER be exposed to the client. Use server-side only (see server/).
export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Ops API runs on 3001 by default (npm run server). Do not use 3000 for API or GET / will 404.
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
