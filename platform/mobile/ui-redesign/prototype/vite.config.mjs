import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('.cache/', import.meta.url)),
  plugins: [react()],
  server: { host: '127.0.0.1', port: 4188, strictPort: true },
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: false },
});
