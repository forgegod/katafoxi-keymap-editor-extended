import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { copyLarkFixture, resolveE2eZmkConfig } from './lark-temp'

const REPO_ROOT = process.cwd()

function newestMtime(dir: string): number {
  let newest = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(full))
    else newest = Math.max(newest, fs.statSync(full).mtimeMs)
  }
  return newest
}

function ensureKeymapCoreBuilt() {
  const dist = path.join(REPO_ROOT, 'packages/keymap-core/dist/index.js')
  const srcDir = path.join(REPO_ROOT, 'packages/keymap-core/src')
  const distMtime = fs.existsSync(dist) ? fs.statSync(dist).mtimeMs : 0
  if (!fs.existsSync(dist) || newestMtime(srcDir) > distMtime) {
    execSync('pnpm --filter @keymap-editor/keymap-core build', {
      cwd: REPO_ROOT,
      stdio: 'inherit'
    })
  }
}

export default async function globalSetup() {
  const tmpRoot = resolveE2eZmkConfig()
  process.env.E2E_ZMK_CONFIG = tmpRoot
  fs.rmSync(tmpRoot, { recursive: true, force: true })
  copyLarkFixture(tmpRoot)
  ensureKeymapCoreBuilt()
}
