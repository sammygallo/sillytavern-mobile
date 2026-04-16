import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Backend URL can be overridden via ST_BACKEND for local dev when the
// default port is already in use (e.g. running two worktrees in parallel).
const BACKEND = process.env.ST_BACKEND || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
      '/csrf-token': {
        target: BACKEND,
        changeOrigin: true,
      },
      '/thumbnail': {
        target: BACKEND,
        changeOrigin: true,
      },
      '/characters': {
        target: BACKEND,
        changeOrigin: true,
      },
      '/scripts': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
})
