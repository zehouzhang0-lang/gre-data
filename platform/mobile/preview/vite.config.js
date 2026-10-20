import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { practiceDataPlugin } from './practice-data.mjs';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), practiceDataPlugin()],
  publicDir: false,
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
  build: {
    outDir: '../artifacts/practice-preview',
    emptyOutDir: true,
    target: 'es2020',
  },
});
