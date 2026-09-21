<script lang="ts">
  import Key from './Keys/Key.svelte'
  import type { LegendMode } from '../../context'

  interface LayoutKey {
    x: number
    y: number
    w?: number
    u?: number
    h?: number
    rx?: number
    ry?: number
    r?: number
    label?: string
  }

  interface Binding {
    value: string | number
    params?: Array<{ value?: string | number; params?: unknown[] }>
  }

  interface Props {
    layout: LayoutKey[]
    bindings: Binding[]
    onUpdate: (bindings: Binding[]) => void
    legendMode?: LegendMode
  }

  let { layout, bindings, onUpdate, legendMode = 'zmk' }: Props = $props()

  const normalized = $derived(
    layout.map((_, i) => bindings[i] || { value: '&none', params: [] })
  )

  function position(key: LayoutKey) {
    return { x: key.x, y: key.y }
  }
  function rotation(key: LayoutKey) {
    return { x: key.rx, y: key.ry, a: key.r }
  }
  function size(key: LayoutKey) {
    const { w = 1, u = w, h = 1 } = key
    return { u: u ?? 1, h: h ?? 1 }
  }

  function handleUpdateBind(keyIndex: number, updateBinding: Binding) {
    onUpdate([
      ...normalized.slice(0, keyIndex),
      updateBinding,
      ...normalized.slice(keyIndex + 1)
    ])
  }
</script>

<div style="position: relative">
  {#each layout as key, i (i)}
    <Key
      position={position(key)}
      rotation={rotation(key)}
      size={size(key)}
      label={key.label}
      value={normalized[i].value}
      params={normalized[i].params}
      {legendMode}
      onUpdate={bind => handleUpdateBind(i, bind as Binding)}
    />
  {/each}
</div>
