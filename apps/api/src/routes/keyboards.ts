import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  InfoValidationError,
  KeymapValidationError,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import { config } from '../config.js'
import { isTrustedAppOrigin } from '../services/github/auth.js'
import * as zmk from '../services/zmk/local-source.js'

export const keyboardsRoutes = new Hono()

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const POST_BODY_MAX_BYTES = 2_000_000
const limitPostBody = bodyLimit({ maxSize: POST_BODY_MAX_BYTES })

function isLoopbackHostHeader(host: string | undefined): boolean {
  if (!host || /[\s\\]/.test(host)) return false
  try {
    const hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, '')
    if (hostname === 'localhost' || hostname === '::1') return true
    const parts = hostname.split('.')
    if (parts.length !== 4) return false
    const octets = parts.map(part => Number(part))
    return octets[0] === 127 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
  } catch {
    return false
  }
}

function isJsonContentType(value: string | undefined): boolean {
  if (!value) return false
  return value.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

function requestHost(c: Context): string | undefined {
  const header = c.req.header('Host')
  if (header) return header
  try {
    return new URL(c.req.url).host
  } catch {
    return undefined
  }
}

// Loopback Host + CSRF only for the local zmk-config adapter.
// Must not use '*' on a router mounted at `/` — that 403s the SPA when
// Host is the public site name (production behind Caddy).
// CSRF: same isTrustedAppOrigin as github routes (services/github/auth).
async function localAdapterGuard(c: Context, next: () => Promise<void>) {
  if (!isLoopbackHostHeader(requestHost(c))) {
    return c.body(null, 403)
  }
  if (!SAFE_METHODS.has(c.req.method) && !isTrustedAppOrigin(c)) {
    return c.body(null, 403)
  }
  if (c.req.method === 'POST') return limitPostBody(c, next)
  await next()
}

keyboardsRoutes.use('/layout', localAdapterGuard)
keyboardsRoutes.use('/keymap', localAdapterGuard)

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

function isBadRequestError(err: unknown): boolean {
  return (
    err instanceof SyntaxError ||
    err instanceof KeymapValidationError ||
    err instanceof InfoValidationError
  )
}

function localLoadError(c: { json: (body: unknown, status: 400 | 404 | 500) => Response }, err: unknown) {
  console.error(err)
  if (isNotFoundError(err)) {
    return c.json({ error: 'not_found' }, 404)
  }
  if (isBadRequestError(err)) {
    return c.json({ error: 'invalid' }, 400)
  }
  return c.json({ error: 'internal' }, 500)
}

keyboardsRoutes.get('/layout', c => {
  if (!config.ENABLE_LOCAL) return c.body(null, 404)
  try {
    return c.json(zmk.loadLayout())
  } catch (err) {
    return localLoadError(c, err)
  }
})

keyboardsRoutes.get('/keymap', c => {
  if (!config.ENABLE_LOCAL) return c.body(null, 404)
  try {
    return c.json(zmk.loadKeymap())
  } catch (err) {
    return localLoadError(c, err)
  }
})

keyboardsRoutes.post('/keymap', async c => {
  if (!config.ENABLE_LOCAL) return c.body(null, 404)

  if (!isJsonContentType(c.req.header('Content-Type'))) {
    return c.body(null, 415)
  }

  try {
    const keymap = (await c.req.json()) as ParsedKeymap
    if (
      keymap == null ||
      typeof keymap !== 'object' ||
      !Array.isArray(keymap.layers)
    ) {
      return c.json({ errors: ['keymap must include a layers array'] }, 400)
    }
    const { mode, warnings } = zmk.saveLocalKeymap(keymap)
    return c.json({ ok: true, mode, warnings })
  } catch (err) {
    if (err instanceof SyntaxError) {
      return c.json({ error: 'invalid' }, 400)
    }
    if (err instanceof KeymapValidationError) {
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    console.error(err)
    return c.json({ error: 'internal' }, 500)
  }
})
