import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Repo root (keymap-editor-extended) */
export const REPO_ROOT = path.resolve(__dirname, '../../..')

function env(key: string, fallback = ''): string {
  return process.env[key] ?? fallback
}

function parseBoolean(val: string | undefined): boolean {
  return !!val && ['1', 'on', 'yes', 'true'].includes(val.toLowerCase())
}

export const config = {
  PORT: Number(env('PORT', '8080')),
  ENABLE_DEV_SERVER: parseBoolean(process.env.ENABLE_DEV_SERVER),
  ENABLE_GITHUB: parseBoolean(process.env.ENABLE_GITHUB),
  GITHUB_APP_NAME: env('GITHUB_APP_NAME'),
  GITHUB_APP_PRIVATE_KEY: env('GITHUB_APP_PRIVATE_KEY'),
  GITHUB_APP_ID: env('GITHUB_APP_ID'),
  GITHUB_CLIENT_ID: env('GITHUB_CLIENT_ID'),
  GITHUB_CLIENT_SECRET: env('GITHUB_CLIENT_SECRET'),
  GITHUB_OAUTH_CALLBACK_URL: env('GITHUB_OAUTH_CALLBACK_URL'),
  APP_BASE_URL: env('APP_BASE_URL', 'http://localhost:5173'),
  WEB_DIST: path.join(REPO_ROOT, 'apps/web/dist'),
  ZMK_CONFIG_PATH: path.join(REPO_ROOT, 'zmk-config')
}
