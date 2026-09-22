import * as config from './config'

export function healthcheck() {
  return fetch(`${config.apiBaseUrl}/health`)
}

export function loadKeymap() {
  return fetch(`${config.apiBaseUrl}/keymap`).then(response => {
    if (!response.ok) {
      throw new Error(`Failed to load keymap (${response.status})`)
    }
    return response.json()
  })
}

export function loadLayout() {
  return fetch(`${config.apiBaseUrl}/layout`).then(response => {
    if (!response.ok) {
      throw new Error(`Failed to load layout (${response.status})`)
    }
    return response.json()
  })
}

/** Re-read local layout + keymap after a successful Write files. */
export async function reloadLocalKeyboard() {
  const [layout, keymap] = await Promise.all([loadLayout(), loadKeymap()])
  return { layout, keymap }
}
