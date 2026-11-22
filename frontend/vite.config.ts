import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The dev server proxies /api to the backend, so the frontend needs no CORS/URL config.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: true,
    // Public demo link through an ngrok tunnel (Vite 6 blocks unknown Host headers).
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io'],
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:8000',
    },
  },
})
