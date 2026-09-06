import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function charsetMiddleware() {
  return {
    name: 'charset-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const originalSetHeader = res.setHeader.bind(res);
        res.setHeader = function(name, value) {
          if (name.toLowerCase() === 'content-type' && typeof value === 'string') {
            // Add charset=utf-8 to text responses that don't already have one
            if (
              (value.startsWith('text/') || value.includes('javascript') || value.includes('json')) &&
              !value.includes('charset')
            ) {
              value += '; charset=utf-8';
            }
          }
          return originalSetHeader(name, value);
        };
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), charsetMiddleware()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3002',
    },
  },
  preview: {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
