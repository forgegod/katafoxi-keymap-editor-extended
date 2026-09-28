import { spawn } from 'node:child_process'

// `pnpm --parallel` pipes child stdio. On Windows, tsx's esbuild then
// hangs in its service ping and the API never binds :8080.
const packages = ['@keymap-editor/api', '@keymap-editor/web']

function start(pkg) {
  const command = `pnpm --filter ${pkg} dev`
  if (process.platform === 'win32') {
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
      stdio: 'inherit'
    })
  }
  return spawn('pnpm', ['--filter', pkg, 'dev'], { stdio: 'inherit' })
}

const children = packages.map(start)

let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue
    if (process.platform === 'win32') {
      spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `taskkill /pid ${child.pid} /t /f`], {
        stdio: 'ignore'
      })
    } else {
      child.kill('SIGTERM')
    }
  }
  setTimeout(() => process.exit(code), 200)
}

for (const child of children) {
  child.on('exit', code => {
    if (!stopping && code) stop(code)
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
