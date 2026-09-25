import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import path from 'node:path'

const coreSrc = path.resolve(__dirname, '../../packages/keymap-core/src/index.ts')

const apiProxy = process.env.API_PROXY || 'http://127.0.0.1:8080'
const vitePort = Number(process.env.VITE_PORT || 5173)

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Resolve core to its sources so edits under packages/keymap-core/src
      // apply without a rebuild. apps/api keeps using dist.
      '@keymap-editor/keymap-core': coreSrc
    }
  },
  server: {
    host: '127.0.0.1',
    port: vitePort,
    strictPort: Boolean(process.env.VITE_PORT),
    proxy: {
      '/health': apiProxy,
      '/layout': apiProxy,
      '/keymap': apiProxy,
      '/github': apiProxy
    }
  }
})
