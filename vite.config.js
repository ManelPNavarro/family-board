import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  input: [
    resolve(import.meta.dirname, 'index.html'),
    resolve(import.meta.dirname, 'compra/index.html'),
  ],
  plugins: [tailwindcss()],
});
