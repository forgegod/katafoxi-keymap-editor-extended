import type { LayoutKey } from './types.js'

export class InfoValidationError extends Error {
  errors: string[]

  constructor(errors: string[]) {
    super()
    this.name = 'InfoValidationError'
    this.errors = errors
  }
}

export interface RenderTableOpts {
  useQuotes?: boolean
  linePrefix?: string
  columnSeparator?: string
}

export function renderTable(
  layout: LayoutKey[],
  layer: string[],
  opts: RenderTableOpts = {}
): string {
  const {
    useQuotes = false,
    linePrefix = '',
    columnSeparator = ','
  } = opts
  const minWidth = useQuotes ? 9 : 7
  const table: (string | undefined)[][] = []

  layer.forEach((code, i) => {
    if (layout[i]) {
      const { row = 0, col } = layout[i]
      table[row] = table[row] || []
      table[row][col ?? table[row].length] = code
    }
  })

  const columns = Math.max(0, ...table.map(row => row?.length ?? 0))
  const columnIndices = Array.from({ length: columns }, (_, i) => i)
  const columnWidths = columnIndices.map(i =>
    Math.max(
      ...table.map(row =>
        ((row?.[i] || '') as string).length +
        columnSeparator.length +
        (useQuotes ? 2 : 0)
      )
    )
  )

  return table
    .map((row, rowIndex) => {
      const isLastRow = rowIndex === table.length - 1
      return (
        linePrefix +
        columnIndices
          .map(i => {
            const noMoreValues = row.slice(i).every(col => col === undefined)
            const noFollowingValues = row.slice(i + 1).every(col => col === undefined)
            const padding = Math.max(minWidth, columnWidths[i])

            if (noMoreValues) return ''
            if (!row[i]) return ' '.repeat(padding + 1)
            const column = (useQuotes ? `"${row[i]}"` : row[i]!).padStart(padding)
            const suffix = isLastRow && noFollowingValues ? '' : columnSeparator
            return column + suffix
          })
          .join('')
          .replace(/\s+$/, '')
      )
    })
    .join('\n')
}

function isNumber(val: unknown): val is number {
  return typeof val === 'number' && !Number.isNaN(val)
}

export function validateInfoJson(info: unknown): void {
  const errors: string[] = []

  if (typeof info !== 'object' || info === null) {
    errors.push('info.json root must be an object')
  } else {
    const root = info as Record<string, unknown>
    if (!root.layouts) {
      errors.push('info must define "layouts"')
    } else if (typeof root.layouts !== 'object' || root.layouts === null) {
      errors.push('layouts must be an object')
    } else {
      const layouts = root.layouts as Record<string, unknown>
      if (Object.values(layouts).length === 0) {
        errors.push('layouts must define at least one layout')
      } else {
        for (const name in layouts) {
          const layout = layouts[name] as Record<string, unknown> | null
          if (typeof layout !== 'object' || layout === null) {
            errors.push(`layout ${name} must be an object`)
          } else if (!Array.isArray(layout.layout)) {
            errors.push(`layout ${name} must define "layout" array`)
          } else {
            const keys = layout.layout as Record<string, unknown>[]
            const anyKeyHasPosition = keys.some(
              key => key?.row !== undefined || key?.col !== undefined
            )

            for (let i = 0; i < keys.length; i++) {
              const key = keys[i]
              const keyPath = `layouts[${name}].layout[${i}]`

              if (typeof key !== 'object' || key === null) {
                errors.push(`Key definition at ${keyPath} must be an object`)
              } else {
                const optionalNumberProps = ['u', 'h', 'r', 'rx', 'ry']
                if (!isNumber(key.x)) {
                  errors.push(`Key definition at ${keyPath} must include "x" position`)
                }
                if (!isNumber(key.y)) {
                  errors.push(`Key definition at ${keyPath} must include "y" position`)
                }
                for (const prop of optionalNumberProps) {
                  if (prop in key && !isNumber(key[prop])) {
                    errors.push(`Key definition at ${keyPath} optional "${prop}" must be number`)
                  }
                }
                for (const prop of ['row', 'col'] as const) {
                  if (anyKeyHasPosition && !(prop in key)) {
                    errors.push(`Key definition at ${keyPath} is missing "${prop}"`)
                  } else if (
                    prop in key &&
                    (!Number.isInteger(key[prop]) || (key[prop] as number) < 0)
                  ) {
                    errors.push(
                      `Key definition at ${keyPath} "${prop}" must be a non-negative integer`
                    )
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (errors.length) {
    throw new InfoValidationError(errors)
  }
}
