import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), {
    name: 'offline-content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'",
      }, injectTo: 'head-prepend' }];
    },
  }],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
