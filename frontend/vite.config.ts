import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Polling is required for HMR on bind-mounted volumes (Docker Desktop on macOS/Windows)
    watch: { usePolling: true },
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/media': { target: apiTarget, changeOrigin: true },
      // Django admin (and its static files, served by runserver in DEBUG)
      '/admin': { target: apiTarget, changeOrigin: true },
      '/static': { target: apiTarget, changeOrigin: true },
    },
  },
})
