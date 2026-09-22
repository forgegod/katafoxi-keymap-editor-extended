import { Hono } from 'hono'
import { KeymapValidationError, type ParsedKeymap } from '@keymap-editor/keymap-core'
import * as zmk from '../services/zmk/local-source.js'

export const keyboardsRoutes = new Hono()

keyboardsRoutes.get('/layout', c => c.json(zmk.loadLayout()))
keyboardsRoutes.get('/keymap', c => c.json(zmk.loadKeymap()))

keyboardsRoutes.post('/keymap', async c => {
  const keymap = (await c.req.json()) as ParsedKeymap

  return new Promise<Response>(resolve => {
    zmk.saveLocalKeymap(keymap, (err, result) => {
      if (err) {
        if (err instanceof KeymapValidationError) {
          resolve(c.json({ name: err.name, errors: err.errors }, 400))
          return
        }
        resolve(c.text(String(err), 500))
        return
      }
      resolve(c.json({ ok: true, mode: result!.mode, warnings: result!.warnings }))
    })
  })
})
