import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import fs from 'node:fs'
import { config } from './config.js'
import { keyboardsRoutes } from './routes/keyboards.js'
import { githubRoutes } from './routes/github.js'

const app = new Hono()

let origin: string
try {
  origin = new URL(config.APP_BASE_URL).origin
} catch {
  origin = 'http://localhost:5173'
}

app.use('*', cors({ origin, credentials: true }))
app.use('*', logger())

app.get('/health', c => c.body(null, 200))
app.route('/', keyboardsRoutes)

if (config.ENABLE_GITHUB) {
  app.route('/github', githubRoutes)
}

if (fs.existsSync(config.WEB_DIST)) {
  app.use('/*', serveStatic({ root: config.WEB_DIST }))
  app.get('*', serveStatic({ root: config.WEB_DIST, path: 'index.html' }))
} else if (!config.ENABLE_DEV_SERVER) {
  console.warn(`Web dist not found at ${config.WEB_DIST}; API-only mode`)
}

console.log(
  `API listening on :${config.PORT} (github=${config.ENABLE_GITHUB}, local=${config.ENABLE_LOCAL})`
)
serve({
  fetch: app.fetch,
  port: config.PORT,
  hostname: '127.0.0.1'
})
