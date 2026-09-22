/**
 * Static ZMK catalogs for the editor. Built once and shared by web (bundled)
 * and API (Node). Prefer these over HTTP /keycodes|/behaviors.
 */

import keycodesData from '../data/zmk-keycodes.json' with { type: 'json' }
import { loadBehaviorsData } from './keymap.js'
import { normalizeZmkKeycodes } from './keycodes.js'
import type { BehaviorDef, KeycodeDef, NormalizedKeycode } from './types.js'

export interface KeycodeCatalog {
  list: NormalizedKeycode[]
  byCode: Record<string, NormalizedKeycode>
}

export interface BehaviorCatalog {
  list: BehaviorDef[]
  byCode: Record<string, BehaviorDef>
}

export function loadKeycodesData(): KeycodeDef[] {
  return keycodesData as KeycodeDef[]
}

let keycodeCatalog: KeycodeCatalog | null = null
let behaviorCatalog: BehaviorCatalog | null = null

export function getKeycodeCatalog(): KeycodeCatalog {
  if (!keycodeCatalog) {
    const list = normalizeZmkKeycodes(loadKeycodesData())
    keycodeCatalog = {
      list,
      byCode: Object.fromEntries(list.map(k => [k.code, k]))
    }
  }
  return keycodeCatalog
}

export function getBehaviorCatalog(): BehaviorCatalog {
  if (!behaviorCatalog) {
    const list = loadBehaviorsData()
    behaviorCatalog = {
      list,
      byCode: Object.fromEntries(list.map(b => [b.code, b]))
    }
  }
  return behaviorCatalog
}
