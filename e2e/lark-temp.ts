import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()

export const LARK_FIXTURE_DIR = path.join(
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

/** Bytes before the firmware `keymap {` node (preamble / splice boundary). */
export function preambleBeforeKeymap(source: string) {
  const marker = 'keymap {'
  const idx = source.indexOf(marker)
  if (idx === -1) {
    throw new Error('keymap source has no "keymap {" marker')
  }
  return source.slice(0, idx)
}
