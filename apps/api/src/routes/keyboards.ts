import { Hono } from 'hono'
import { KeymapValidationError, type ParsedKeymap } from '@keymap-editor/keymap-core'
import { config } from '../config.js'
import * as zmk from '../services/zmk/local-source.js'

export const keyboardsRoutes = new Hono()

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
    err instanceof TypeError ||
    err instanceof KeymapValidationError
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

  const keymap = (await c.req.json()) as ParsedKeymap
  try {
    const { mode, warnings } = zmk.saveLocalKeymap(keymap)
    return c.json({ ok: true, mode, warnings })
  } catch (err) {
    if (err instanceof KeymapValidationError) {
      return c.json({ name: err.name, errors: err.errors }, 400)
    }
    console.error(err)
    return c.json({ error: 'internal' }, 500)
  }
})
