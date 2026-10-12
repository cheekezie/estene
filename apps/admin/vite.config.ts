import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5400, strictPort: true },
  preview: { port: 5400 },
  build: {
    rollupOptions: {
      output: {
        // Vendors change rarely — separate chunks stay cached across deploys.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          data: ['@tanstack/react-query', 'axios', 'zustand'],
          forms: ['zod', 'react-hook-form', '@hookform/resolvers'],
        },
      },
    },
  },
});
