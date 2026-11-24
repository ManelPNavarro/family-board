import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  define: { __BUILD_COMMIT__: JSON.stringify(process.env.GITHUB_SHA ?? '') },
  plugins: [tailwindcss()],
});
