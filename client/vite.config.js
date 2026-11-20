import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    // Запити /api під час розробки перенаправляються на Express (порт 4000)
    proxy: { '/api': 'http://localhost:4000', '/openapi.yaml': 'http://localhost:4000' }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
