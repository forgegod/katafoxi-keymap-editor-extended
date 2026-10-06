import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO_ROOT = process.cwd()

/** Shared fixture root. Does not create the directory. */
export function resolveE2eZmkConfig(): string {
  return process.env.E2E_ZMK_CONFIG ?? path.join(os.tmpdir(), 'keymap-e2e')
}

const LARK_FIXTURE_DIR = path.join(
  REPO_ROOT,
  'packages/keymap-core/fixtures/lark'
)

/** Copy vendored LARK files into `<destRoot>/config/` without touching the fixture. */
export function copyLarkFixture(destRoot: string) {
  const destConfig = path.join(destRoot, 'config')
  fs.mkdirSync(destConfig, { recursive: true })
  for (const name of fs.readdirSync(destConfig)) {
    fs.rmSync(path.join(destConfig, name), { recursive: true, force: true })
  }
  fs.copyFileSync(
    path.join(LARK_FIXTURE_DIR, 'info.json'),
    path.join(destConfig, 'info.json')
  )
  fs.copyFileSync(
    path.join(LARK_FIXTURE_DIR, 'lark.keymap'),
    path.join(destConfig, 'lark.keymap')
  )
}

export function tempKeymapPath(destRoot: string) {
  return path.join(destRoot, 'config', 'lark.keymap')
}

/** Bytes before the firmware root `/ {` node (#define, includes, behavior stubs). */
export function preambleBeforeKeymap(source: string) {
  const marker = '/ {'
  const idx = source.indexOf(marker)
  if (idx === -1) {
    throw new Error('keymap source has no "/ {" root node')
  }
  return source.slice(0, idx)
}
