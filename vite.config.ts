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
        headers: process.env.ST_BASIC_AUTH
          ? { Authorization: `Basic ${Buffer.from(process.env.ST_BASIC_AUTH).toString('base64')}` }
          : {},
      },
      '/csrf-token': {
        target: BACKEND,
        changeOrigin: true,
        headers: process.env.ST_BASIC_AUTH
          ? { Authorization: `Basic ${Buffer.from(process.env.ST_BASIC_AUTH).toString('base64')}` }
          : {},
      },
      '/thumbnail': {
        target: BACKEND,
        changeOrigin: true,
        headers: process.env.ST_BASIC_AUTH
          ? { Authorization: `Basic ${Buffer.from(process.env.ST_BASIC_AUTH).toString('base64')}` }
          : {},
      },
      '/characters': {
        target: BACKEND,
        changeOrigin: true,
        headers: process.env.ST_BASIC_AUTH
          ? { Authorization: `Basic ${Buffer.from(process.env.ST_BASIC_AUTH).toString('base64')}` }
          : {},
      },
      '/scripts': {
        target: BACKEND,
        changeOrigin: true,
        headers: process.env.ST_BASIC_AUTH
          ? { Authorization: `Basic ${Buffer.from(process.env.ST_BASIC_AUTH).toString('base64')}` }
          : {},
        // Specific upstream-compat shim modules served from public/ must NOT
        // be proxied — they shadow upstream files of the same name so
        // ES-module-based extensions can `import { ... } from '../../../...'`
        // without dragging in the upstream monolith. Returning the request
        // URL bypasses the proxy and lets Vite's static middleware serve the
        // public/ copy.
        bypass(req) {
          const url = req.url || ''
          const path = url.split('?')[0]
          if (
            path === '/scripts/extensions.js' ||
            path === '/scripts/slash-commands.js' ||
            path === '/scripts/utils.js'
          ) {
            return url
          }
          return undefined
        },
      },
    },
  },
})
