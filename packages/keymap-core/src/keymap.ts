import behaviorsData from '../data/zmk-behaviors.json' with { type: 'json' }
import {
  keymapBindingsText,
  macrosAppearInText,
  parseDefines
} from './dts-keymap.js'
import { assertLayerKeyCounts, spliceBindingsIntoDts } from './dts-splice.js'
import { bindingColumnWidths, renderTable } from './layout.js'
import { KeymapValidationError } from './errors.js'
import type { BehaviorDef, KeyBindingNode, LayoutKey, ParsedKeymap } from './types.js'

export { KeymapValidationError } from './errors.js'

export type BuildKeymapCodeMode = 'template' | 'splice' | 'default_template'

export interface BuildKeymapCodeResult {
  code: string
  json: string
  mode: BuildKeymapCodeMode
  warnings: string[]
}

const behaviours = behaviorsData as BehaviorDef[]
const behavioursByBind = Object.fromEntries(behaviours.map(b => [b.code, b]))

export const keymapTemplate = `
/*
 * Copyright (c) 2020 The ZMK Contributors
 *
 * SPDX-License-Identifier: MIT
 */


/* THIS FILE WAS GENERATED!
 *
 * This file was generated automatically. You may or may not want to
 * edit it directly.
 */

#include <behaviors.dtsi>
{{behaviour_includes}}

/ {
    keymap {
        compatible = "zmk,keymap";

{{rendered_layers}}
    };
};
`

function encodeBindValue(parsed: KeyBindingNode): string {
  const params = (parsed.params || []).map(encodeBindValue)
  const paramString = params.length > 0 ? `(${params.join(',')})` : ''
  return String(parsed.value) + paramString
}

export function encodeKeyBinding(parsed: KeyBindingNode): string {
  const { value, params } = parsed
  return `${value} ${params.map(encodeBindValue).join(' ')}`.trim()
}

export function encodeKeymap(parsedKeymap: ParsedKeymap) {
  return {
    ...parsedKeymap,
    layers: parsedKeymap.layers.map(layer => layer.map(encodeKeyBinding))
  }
}

function getBehavioursUsed(keymap: ParsedKeymap): string[] {
  const keybinds = keymap.layers.flat()
  return [...new Set(keybinds.map(b => String(b.value)))]
}

/**
 * Parse a bind string into a tree of values and parameters
 */
export function parseKeyBinding(binding: string): KeyBindingNode {
  const paramsPattern = /\((.+)\)/

  function parse(code: string): KeyBindingNode {
    const value = code.replace(paramsPattern, '')
    const match = code.match(paramsPattern)
    const params = (match?.[1] ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(parse)

    return { value, params }
  }

  const valueMatch = binding.match(/^(&.+?)\b/)
  if (!valueMatch) {
    throw new Error(`Invalid key binding: ${binding}`)
  }
  const value = valueMatch[1]
  const params = binding
    .replace(/^&.+?\b\s*/, '')
    .split(' ')
    .filter(Boolean)
    .map(parse)

  return { value, params }
}

export function parseKeymap(keymap: {
  layers: string[][]
  [key: string]: unknown
}): ParsedKeymap {
  return {
    ...keymap,
    layers: keymap.layers.map(layer => layer.map(parseKeyBinding))
  }
}

function renderTemplate(
  template: string,
  params: {
    layout: LayoutKey[]
    behaviourHeaders: string[]
    layers: string[][]
    layerNames: string[]
  }
): string {
  const includesPattern = /\{\{\s*behaviour_includes\s*\}\}/
  const layersPattern = /\{\{\s*rendered_layers\s*\}\}/
  const columnWidths = bindingColumnWidths(params.layout, params.layers, {
    columnSeparator: ' '
  })

  const renderedLayers = params.layers.map((layer, i) => {
    const name = i === 0 ? 'default_layer' : `layer_${params.layerNames[i] || i}`
    const rendered = renderTable(params.layout, layer, {
      linePrefix: '',
      columnSeparator: ' ',
      columnWidths
    })

    return `
        ${name.replace(/[^a-zA-Z0-9_]/g, '_')} {
            bindings = <
${rendered}
            >;
        };
`
  })

  return template
    .replace(includesPattern, params.behaviourHeaders.join('\n'))
    .replace(layersPattern, renderedLayers.join(''))
}

function generateKeymapCode(
  layout: LayoutKey[],
  keymap: ParsedKeymap,
  encoded: ReturnType<typeof encodeKeymap>,
  template: string
): string {
  const names = (keymap.layer_names as string[]) || []
  const behaviourHeaders = [
    ...new Set(
      getBehavioursUsed(keymap).flatMap(
        bind => behavioursByBind[bind]?.includes ?? []
      )
    )
  ]

  return renderTemplate(template, {
    layout,
    behaviourHeaders,
    layers: encoded.layers as string[][],
    layerNames: names
  })
}

function generateKeymapJSON(
  layout: LayoutKey[],
  encoded: ReturnType<typeof encodeKeymap>
): string {
  const layers = encoded.layers as string[][]
  const columnWidths = bindingColumnWidths(layout, layers, { useQuotes: true })
  const base = JSON.stringify({ ...encoded, layers: null }, null, 2)
  const rendered = layers.map(layer => {
    const body = renderTable(layout, layer, {
      useQuotes: true,
      linePrefix: '      ',
      columnWidths
    })
    return `[\n${body}\n    ]`
  })

  return base.replace('"layers": null', `"layers": [\n    ${rendered.join(', ')}\n  ]`)
}

export function generateKeymap(
  layout: LayoutKey[],
  keymap: ParsedKeymap,
  template?: string
): { code: string; json: string } {
  const encoded = encodeKeymap(keymap)
  return {
    code: generateKeymapCode(layout, keymap, encoded, template || keymapTemplate),
    json: generateKeymapJSON(layout, encoded)
  }
}

/**
 * Prefer an explicit template, else splice into originalSource, else the default
 * generated template. Always validates layer key counts first.
 */
export function buildKeymapCode(
  layout: LayoutKey[],
  keymap: ParsedKeymap,
  options?: { template?: string; originalSource?: string }
): BuildKeymapCodeResult {
  const encoded = encodeKeymap(keymap)
  const layers = encoded.layers as string[][]
  assertLayerKeyCounts(layout, layers)

  const layerNames = (keymap.layer_names as string[]) || []
  const warnings: string[] = []
  const template = options?.template
  const originalSource = options?.originalSource

  if (typeof template === 'string' && template.length > 0) {
    return {
      code: generateKeymapCode(layout, keymap, encoded, template),
      json: generateKeymapJSON(layout, encoded),
      mode: 'template',
      warnings
    }
  }

  if (typeof originalSource === 'string' && originalSource.length > 0) {
    const macros = parseDefines(originalSource)
    const bindingsText = keymapBindingsText(originalSource)
    if (bindingsText && macrosAppearInText(bindingsText, macros)) {
      warnings.push('macros_expanded')
    }
    const code = spliceBindingsIntoDts(originalSource, {
      layout,
      layers,
      layerNames
    })
    return {
      code,
      json: generateKeymapJSON(layout, encoded),
      mode: 'splice',
      warnings
    }
  }

  warnings.push('generated_default_template')
  return {
    code: generateKeymapCode(layout, keymap, encoded, keymapTemplate),
    json: generateKeymapJSON(layout, encoded),
    mode: 'default_template',
    warnings
  }
}

export function validateKeymapJson(keymap: unknown): void {
  const errors: string[] = []

  if (typeof keymap !== 'object' || keymap === null) {
    errors.push('keymap.json root must be an object')
  } else {
    const km = keymap as { layers?: unknown }
    if (!Array.isArray(km.layers)) {
      errors.push('keymap must include "layers" array')
    } else {
      for (let i = 0; i < km.layers.length; i++) {
        const layer = km.layers[i]
        if (!Array.isArray(layer)) {
          errors.push(`Layer at layers[${i}] must be an array`)
        } else {
          for (let j = 0; j < layer.length; j++) {
            const key = layer[j]
            const keyPath = `layers[${i}][${j}]`
            if (typeof key !== 'string') {
              errors.push(`Value at "${keyPath}" must be a string`)
            } else {
              const bind = key.match(/^&.+?\b/)
              if (!(bind && bind[0] in behavioursByBind)) {
                errors.push(`Key bind at "${keyPath}" has invalid behaviour`)
              }
            }
          }
        }
      }
    }
  }

  if (errors.length) {
    throw new KeymapValidationError(errors)
  }
}

/**
 * True when keymap.json is non-empty and passes validateKeymapJson.
 * Empty shells (`[]`, `[[]]`) and invalid binds are not primary — callers fall back to .keymap.
 */
export function isPrimaryKeymapJson(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const layers = (value as { layers?: unknown }).layers
  if (!Array.isArray(layers) || layers.length === 0) return false
  if (!layers.some(layer => Array.isArray(layer) && layer.length > 0)) return false
  try {
    validateKeymapJson(value)
    return true
  } catch (err) {
    if (err instanceof KeymapValidationError) return false
    throw err
  }
}

/** User `.keymap` only — excludes `*.keymap.template` (case-insensitive). */
export function isUserKeymapFilename(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.keymap') && !lower.endsWith('.keymap.template')
}

export function loadBehaviorsData(): BehaviorDef[] {
  return behaviours
}
