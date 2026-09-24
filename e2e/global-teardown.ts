import fs from 'node:fs'

export default async function globalTeardown() {
  const dir = process.env.E2E_ZMK_CONFIG
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
}
