import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    chunkSizeWarningLimit: 2000,
    assetsDir: 'assets',
    rollupOptions: {
      onwarn(warning, warn) {
        // Ignore TypeScript errors during build
        if (warning.code === 'PLUGIN_WARNING') return;
        warn(warning);
      },
      external: ['node-pty'],
    },
  },
  define: {
    // Ensure compatibility with production builds
    global: 'globalThis',
  },
  esbuild: {
    // Ignore TypeScript errors during build
    logLevel: 'error',
  },
});
