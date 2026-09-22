import * as config from './config'

export function healthcheck() {
  return fetch(`${config.apiBaseUrl}/health`)
}

export function loadKeymap() {
  return fetch(`${config.apiBaseUrl}/keymap`).then(response => response.json())
}

export function loadLayout() {
  return fetch(`${config.apiBaseUrl}/layout`).then(response => response.json())
}
