import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const devPort = Number(env.DEV_PORT) || 3000;
  const serverPort = Number(env.SERVER_PORT) || 5000;

  return {
    base: '/',
    plugins: [react()],
    test: {
      name: { label: 'Client Tests', color: 'red' },
      environment: 'jsdom',
      setupFiles: ['./vitest-setup.ts'],
    },
    server: {
      port: devPort,
      strictPort: true,
      host: '0.0.0.0',
      watch: {
        usePolling: true,
      },
      proxy: {
        '/api': {
          target: `http://node:${serverPort}`,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
