import { Hono } from 'hono'
import { KeymapValidationError, type ParsedKeymap } from '@keymap-editor/keymap-core'
import { config } from '../config.js'
import * as zmk from '../services/zmk/local-source.js'

export const keyboardsRoutes = new Hono()

keyboardsRoutes.get('/layout', c => {
  if (!config.ENABLE_LOCAL) return c.body(null, 404)
  return c.json(zmk.loadLayout())
})

keyboardsRoutes.get('/keymap', c => {
  if (!config.ENABLE_LOCAL) return c.body(null, 404)
  return c.json(zmk.loadKeymap())
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
    return c.text(String(err), 500)
  }
})
