import { defineConfig } from '@playwright/test'

const basePath = process.env.PAGES_BASE_PATH || '/pages-preview/'
const port = Number(process.env.E2E_PAGES_PORT || 18082)
const origin = `http://127.0.0.1:${port}`
const liveUrl = process.env.PAGES_TEST_URL

export default defineConfig({
  testDir: 'e2e/pages',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: liveUrl || `${origin}${basePath}`,
    browserName: 'chromium',
    viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure'
  },
  webServer: liveUrl ? undefined : {
    command: `pnpm --filter @keymap-editor/web build --base ${basePath} && pnpm --filter @keymap-editor/web preview --base ${basePath} --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${origin}${basePath}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_ENABLE_GITHUB: 'false',
      VITE_ENABLE_LOCAL: 'false'
    }
  }
})
