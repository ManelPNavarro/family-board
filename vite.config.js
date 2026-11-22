import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  define: { __BUILD_COMMIT__: JSON.stringify(process.env.GITHUB_SHA ?? '') },
  input: [
    resolve(import.meta.dirname, 'index.html'),
    resolve(import.meta.dirname, 'compra/index.html'),
  ],
  plugins: [tailwindcss()],
});
