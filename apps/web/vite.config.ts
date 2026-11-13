import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server is the local equivalent of the k8s ingress:
//   /api                         -> backend
//   /Books, /lib, /AV, ...       -> opendsa
// This keeps LTI launches and compiled-book asset requests on one origin.
const backendTarget = process.env.API_PROXY_TARGET || 'http://localhost:3000';
const opendsaTarget = process.env.BOOKS_PROXY_TARGET || 'http://localhost:8080';

const opendsaRoutes = [
  '/Books',
  '/AV',
  '/DataStructures',
  '/Exercises',
  '/khan-exercises',
  '/lib',
  '/Metadata/inlineav',
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: [".ngrok-free.dev", ".trycloudflare.com"],
    proxy: {
      '/api': backendTarget,
      '/OpenDSA': {
        target: opendsaTarget,
        rewrite: (path) => path.replace(/^\/OpenDSA(?=\/|$)/, '') || '/',
      },
      ...Object.fromEntries(opendsaRoutes.map((route) => [route, opendsaTarget])),
    },
  },
});
