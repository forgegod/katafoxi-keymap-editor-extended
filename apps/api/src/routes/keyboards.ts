import { Hono } from 'hono'
import { generateKeymap, type ParsedKeymap } from '@keymap-editor/keymap-core'
import * as zmk from '../services/zmk/local-source.js'

export const keyboardsRoutes = new Hono()

keyboardsRoutes.get('/behaviors', c => c.json(zmk.loadBehaviors()))
keyboardsRoutes.get('/keycodes', c => c.json(zmk.loadKeycodes()))
keyboardsRoutes.get('/layout', c => c.json(zmk.loadLayout()))
keyboardsRoutes.get('/keymap', c => c.json(zmk.loadKeymap()))

keyboardsRoutes.post('/keymap', async c => {
  const keymap = (await c.req.json()) as ParsedKeymap
  const layout = zmk.loadLayout()
  const generatedKeymap = generateKeymap(layout, keymap)
  const flash = c.req.query('flash') !== undefined

  return new Promise<Response>(resolve => {
    zmk.exportKeymap(generatedKeymap, flash, err => {
      if (err) {
        resolve(c.text(String(err), 500))
        return
      }
      resolve(c.body(null, 200))
    })
  })
})
