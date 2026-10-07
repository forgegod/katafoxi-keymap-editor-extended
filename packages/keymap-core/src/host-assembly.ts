/** How many remembered column sets one keyboard keeps. */
export const HOST_ASSEMBLY_LIMIT = 3

export interface HostAssemblyColumnLabel {
  languageName: string
  layoutName: string
}

/**
 * Accessible name for a remembered legend view.
 * The chip draws a flag and the short layout name; this string qualifies a
 * repeated name with the language (`English System + Russian System`).
 * Unique layout names stay as they are (`System + typewriter`).
 */
export function hostAssemblyName(columns: readonly HostAssemblyColumnLabel[]): string {
  const labels = columns.map(column => column.layoutName.trim() || column.languageName.trim())
  const folded = labels.map(label => label.toLocaleLowerCase('en'))
  if (folded.length === new Set(folded).size) return labels.join(' + ')
  return columns
    .map(column => {
      const language = column.languageName.trim()
      const layout = column.layoutName.trim()
      if (!layout || layout.toLocaleLowerCase('en') === language.toLocaleLowerCase('en')) {
        return language || layout
      }
      return `${language} ${layout}`.trim()
    })
    .join(' + ')
}
