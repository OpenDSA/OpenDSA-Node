import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, 
    proxy: {
      '/api': 'http://backend:3000',
      // Mirrors the Ingress split in k8s/60-ingress.yaml so compiled books
      // can be viewed from the dev server instead of :8080 directly.
      '/Books': 'http://opendsa:8080'
    }
  }
});
