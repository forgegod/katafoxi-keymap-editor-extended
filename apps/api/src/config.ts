import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Repo root (keymap-editor-extended) */
export const REPO_ROOT = path.resolve(__dirname, '../../..')

/** Load repo `.env` when present; never override existing process.env (Heroku-safe). */
function loadDotEnvIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

loadDotEnvIfExists(path.join(REPO_ROOT, '.env'))

function env(key: string, fallback = ''): string {
  return process.env[key] ?? fallback
}

function parseBoolean(val: string | undefined): boolean {
  return !!val && ['1', 'on', 'yes', 'true'].includes(val.toLowerCase())
}

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Sibling zmk-config I/O is a local-dev adapter. Refuse to enable it in
 * production so a 0.0.0.0 bind cannot expose the server filesystem.
 */
export function assertLocalDevAdapterAllowed(
  enableLocal = parseBoolean(process.env.ENABLE_LOCAL),
  nodeEnv = process.env.NODE_ENV
): void {
  if (enableLocal && nodeEnv === 'production') {
    throw new Error('ENABLE_LOCAL cannot be enabled when NODE_ENV is production')
  }
}

export function originFromBaseUrl(appBaseUrl: string): string {
  try {
    return new URL(appBaseUrl).origin
  } catch {
    return 'http://127.0.0.1:5173'
  }
}

export const config = {
  /** Bind address. Override with HOST; default loopback locally, all interfaces in production. */
  HOST: env('HOST', isProduction ? '0.0.0.0' : '127.0.0.1'),
  PORT: Number(env('PORT', '8080')),
  ENABLE_DEV_SERVER: parseBoolean(process.env.ENABLE_DEV_SERVER),
  ENABLE_GITHUB: parseBoolean(process.env.ENABLE_GITHUB),
  ENABLE_LOCAL: parseBoolean(process.env.ENABLE_LOCAL),
  GITHUB_APP_PRIVATE_KEY: env('GITHUB_APP_PRIVATE_KEY'),
  GITHUB_APP_ID: env('GITHUB_APP_ID'),
  GITHUB_CLIENT_ID: env('GITHUB_CLIENT_ID'),
  GITHUB_CLIENT_SECRET: env('GITHUB_CLIENT_SECRET'),
  GITHUB_OAUTH_CALLBACK_URL: env('GITHUB_OAUTH_CALLBACK_URL'),
  APP_BASE_URL: env('APP_BASE_URL', 'http://127.0.0.1:5173'),
  WEB_DIST: path.join(REPO_ROOT, 'apps/web/dist'),
  ZMK_CONFIG_PATH: env('ZMK_CONFIG_PATH', path.join(REPO_ROOT, 'zmk-config'))
}
