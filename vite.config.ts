import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // deployable to any static host path
  build: {
    chunkSizeWarningLimit: 1200, // MapLibre alone is ~800 kB minified
  },
});
