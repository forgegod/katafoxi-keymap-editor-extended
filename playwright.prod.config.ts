import { defineConfig } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const WEB_DIST = path.join(REPO_ROOT, 'apps/web/dist')

function reservePort(preferred: number): number {
  const script = `
    const net = require('net');
    const preferred = ${preferred};
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      const fallback = net.createServer();
      fallback.unref();
      fallback.listen(0, '127.0.0.1', () => {
        const port = fallback.address().port;
        fallback.close(() => process.stdout.write(String(port)));
      });
    });
    server.listen(preferred, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => process.stdout.write(String(port)));
    });
  `
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || 'failed to reserve a TCP port')
  }
  const port = Number(result.stdout.trim())
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`invalid reserved port: ${result.stdout}`)
  }
  return port
}

const port = process.env.E2E_PROD_PORT
  ? Number(process.env.E2E_PROD_PORT)
  : reservePort(18081)
process.env.E2E_PROD_PORT = String(port)

const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: 'e2e/prod',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: origin,
    browserName: 'chromium',
    viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm build && node apps/api/dist/index.js',
    cwd: REPO_ROOT,
    url: `${origin}/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ENABLE_GITHUB: 'false',
      ENABLE_LOCAL: 'false',
      WEB_DIST,
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_BASE_URL: origin
    }
  }
})
