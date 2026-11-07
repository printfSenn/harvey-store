import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787'
    }
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        topup: resolve(rootDir, 'topup.html'),
        payment: resolve(rootDir, 'payment.html'),
        ratings: resolve(rootDir, 'ratings.html'),
        history: resolve(rootDir, 'history.html'),
        account: resolve(rootDir, 'account.html'),
        news: resolve(rootDir, 'news.html'),
        admin: resolve(rootDir, 'admin.html'),
        notFound: resolve(rootDir, '404.html')
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          icons: ['lucide-react']
        }
      }
    }
  }
});
