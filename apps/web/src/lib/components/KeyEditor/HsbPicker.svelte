<script lang="ts">
  import {
    clampHsb,
    hsbToCss,
    type HsbColor
  } from '@keymap-editor/keymap-core'
  import './HsbPicker.css'

  interface Props {
    value: HsbColor
    onChange: (next: HsbColor) => void
    /** Tiny swatch for the Presets recipe row. */
    compact?: boolean
    title?: string
    'aria-label'?: string
    'data-rgblayer-color'?: string | number
  }

  let {
    value,
    onChange,
    compact = false,
    title,
    'aria-label': ariaLabel = 'Color',
    'data-rgblayer-color': dataRgbLayerColor
  }: Props = $props()

  let draft = $state<HsbColor>({ h: 0, s: 0, b: 0 })

  $effect(() => {
    draft = clampHsb(value)
  })

  const css = $derived(hsbToCss(draft))
  const hex = $derived(hsbToHex(draft))
  const tip = $derived(title ?? css)

  function commit(next: HsbColor) {
    const clamped = clampHsb(next)
    draft = clamped
    onChange(clamped)
  }

  function setFromHex(raw: string) {
    const parsed = hexToHsb(raw)
    if (parsed) commit(parsed)
  }

  /** ZMK HSB (0–255) → #rrggbb for the native color input. */
  function hsbToHex(color: HsbColor): string {
    const { h, s, b } = clampHsb(color)
    const hh = (h / 255) * 360
    const ss = s / 255
    const vv = b / 255
    const c = vv * ss
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
    const m = vv - c
    let r = 0
    let g = 0
    let bl = 0
    if (hh < 60) [r, g, bl] = [c, x, 0]
    else if (hh < 120) [r, g, bl] = [x, c, 0]
    else if (hh < 180) [r, g, bl] = [0, c, x]
    else if (hh < 240) [r, g, bl] = [0, x, c]
    else if (hh < 300) [r, g, bl] = [x, 0, c]
    else [r, g, bl] = [c, 0, x]
    const toByte = (n: number) =>
      Math.max(0, Math.min(255, Math.round((n + m) * 255)))
        .toString(16)
        .padStart(2, '0')
    return `#${toByte(r)}${toByte(g)}${toByte(bl)}`
  }

  function hexToHsb(hexValue: string): HsbColor | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(hexValue.trim())
    if (!match) return null
    const n = Number.parseInt(match[1]!, 16)
    const r = ((n >> 16) & 255) / 255
    const g = ((n >> 8) & 255) / 255
    const bl = (n & 255) / 255
    const max = Math.max(r, g, bl)
    const min = Math.min(r, g, bl)
    const d = max - min
    let h = 0
    if (d !== 0) {
      if (max === r) h = ((g - bl) / d) % 6
      else if (max === g) h = (bl - r) / d + 2
      else h = (r - g) / d + 4
      h *= 60
      if (h < 0) h += 360
    }
    const s = max === 0 ? 0 : d / max
    return clampHsb({
      h: (h / 360) * 255,
      s: s * 255,
      b: max * 255
    })
  }
</script>

<div
  class="hsb-picker"
  class:compact
  data-hsb-picker
  data-rgblayer-color={dataRgbLayerColor}
>
  <label
    class="hsb-picker-swatch"
    style:background={css}
    style:--swatch={css}
    title={tip}
  >
    <span class="hsb-picker-swatch-label">{ariaLabel}</span>
    <input
      class="hsb-picker-color"
      type="color"
      value={hex}
      aria-label={ariaLabel}
      oninput={e => setFromHex((e.currentTarget as HTMLInputElement).value)}
    />
  </label>
</div>
