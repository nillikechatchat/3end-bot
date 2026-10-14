import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The web client is one of the three ends; it talks to the standalone server over
// /api (proxied in dev, same origin in production when the server serves this build).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.monkeycode-ai.online'],
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
