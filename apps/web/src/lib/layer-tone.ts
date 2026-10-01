/** CSS custom property for the muted layer stripe (cycles every four layers). */
export function layerToneStyle(layer: number): string {
  const band = ((layer % 4) + 4) % 4
  return `--layer-tone: var(--layer-tone-${band})`
}
