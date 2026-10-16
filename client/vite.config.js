import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:5000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        // @ points at src so a deep component never needs a ../../.. chain
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // Both the api and the socket go through vite in development, so the refresh cookie stays first
      // party: the browser sees one origin, not two.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, changeOrigin: true, ws: true },
      },
    },
  };
});
