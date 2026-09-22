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
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/health': 'http://127.0.0.1:8080',
      '/layout': 'http://127.0.0.1:8080',
      '/keymap': 'http://127.0.0.1:8080',
      '/github': 'http://127.0.0.1:8080'
    }
  }
})
