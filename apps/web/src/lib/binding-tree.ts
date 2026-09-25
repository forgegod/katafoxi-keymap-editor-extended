import type { KeyBindingNode } from '@keymap-editor/keymap-core'
import type { HydratedNode } from './hydrate'

/** Clone a bind tree without `source` — those $state proxies break structuredClone. */
export function cloneBindTree(node: HydratedNode): HydratedNode {
  return {
    value: node.value,
    params: (node.params ?? []).map(cloneBindTree)
  }
}

export function toBindingNode(node: HydratedNode): KeyBindingNode {
  return {
    value: node.value ?? '',
    params: (node.params ?? []).map(toBindingNode)
  }
}

export function toKeyBinding(node: HydratedNode): KeyBindingNode {
  return {
    value: node.value ?? '&none',
    params: (node.params ?? []).map(toKeyBinding)
  }
}

export function currentBinding(
  value: string | number,
  params?: Array<{ value?: string | number; params?: unknown[] }>
): KeyBindingNode {
  return {
    value,
    params: (params ?? []).map(node => ({
      value: node.value ?? '',
      params: (node.params ?? []) as KeyBindingNode[]
    }))
  }
}
