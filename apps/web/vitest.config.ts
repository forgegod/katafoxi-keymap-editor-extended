import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'node:path'

export default defineConfig({
  plugins: [svelte({ hot: false, compilerOptions: { runes: true } })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@keymap-editor/keymap-core': path.resolve(__dirname, '../../packages/keymap-core/src/index.ts')
    },
    conditions: ['browser']
  },
  test: {
    // The browser client ships extensionless ESM imports; let Vite resolve them.
    server: { deps: { inline: ['@zmkfirmware/zmk-studio-ts-client'] } },
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    css: true
  }
})
