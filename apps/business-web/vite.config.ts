import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API runs on :3000 and this dev server proxies to it, so the browser sees
// one origin (cookies and CSRF checks). In production the API serves the built files itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ['/api', '/session', '/me', '/commands', '/orders', '/permissions', '/records', '/files', '/jobs', '/recycle-bin', '/inventory', '/service'].map((p) => [p, process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3000']),
    ),
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
