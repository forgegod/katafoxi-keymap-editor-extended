import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://localhost:8080',
      '/behaviors': 'http://localhost:8080',
      '/keycodes': 'http://localhost:8080',
      '/layout': 'http://localhost:8080',
      '/keymap': 'http://localhost:8080',
      '/github': 'http://localhost:8080'
    }
  }
})
