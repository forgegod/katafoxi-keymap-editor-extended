export { normalizeZmkKeycodes } from '@keymap-editor/keymap-core'
import { normalizeZmkKeycodes } from '@keymap-editor/keymap-core'
import * as api from './api'

export function loadKeycodes() {
  return api.loadKeycodes().then(normalizeZmkKeycodes)
}
