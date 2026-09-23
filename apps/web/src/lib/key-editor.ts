import {
  childCodeIndex,
  type HydratedNode
} from './hydrate'

export interface EditorSlot {
  codeIndex: number
  param: unknown
  value: string | number | undefined
  label: string
}

const SLOT_LABELS: Record<string, string> = {
  layer: 'Layer',
  mod: 'Modifier',
  behaviour: 'Behaviour',
  command: 'Command',
  keycode: 'Key',
  code: 'Key'
}

export function slotLabel(param: unknown): string {
  if (param && typeof param === 'object' && 'name' in param) {
    const name = (param as { name?: string }).name
    if (name) return name
  }
  if (typeof param === 'string') return SLOT_LABELS[param] ?? param
  return 'Value'
}

export function isKeycodeParam(param: unknown): boolean {
  return param === 'code' || param === 'keycode'
}

/** Behaviour slot plus each hydrated param (including nested LC(code) slots). */
export function buildEditorSlots(
  normalized: HydratedNode,
  behaviourParams: unknown[]
): EditorSlot[] {
  const slots: EditorSlot[] = [
    {
      codeIndex: 0,
      param: 'behaviour',
      value: normalized.value,
      label: slotLabel('behaviour')
    }
  ]

  function walk(
    parentIndex: number,
    params: unknown[],
    values: HydratedNode[]
  ) {
    params.forEach((param, i) => {
      const codeIndex = childCodeIndex(parentIndex, values, i)
      const node = values[i]
      slots.push({
        codeIndex,
        param,
        value: node?.value,
        label: slotLabel(param)
      })
      const nested = (node?.source?.params as unknown[]) || []
      if (nested.length > 0) {
        walk(codeIndex, nested, node?.params ?? [])
      }
    })
  }

  walk(0, behaviourParams, normalized.params)
  return slots
}
