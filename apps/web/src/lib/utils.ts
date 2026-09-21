export function keyBy<T>(
  arr: T[] | undefined | null,
  key: keyof T | ((item: T) => string | number)
): Record<string, T> {
  const result: Record<string, T> = {}
  for (const item of arr ?? []) {
    const k = typeof key === 'function' ? String(key(item)) : String(item[key])
    result[k] = item
  }
  return result
}

export function get(obj: unknown, path: string, fallback?: unknown): unknown {
  if (obj == null) return fallback
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let cur: unknown = obj
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return fallback
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur === undefined ? fallback : cur
}

export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) {
    if (key in obj) result[key] = obj[key]
  }
  return result
}

export function cloneDeep<T>(value: T): T {
  return structuredClone(value)
}

export function compact<T>(arr: Array<T | null | undefined | false | 0 | ''>): T[] {
  return arr.filter(Boolean) as T[]
}

export function times<T>(n: number, fn: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i))
}

export function filterBy<T>(arr: T[], key: keyof T): T[] {
  return arr.filter(item => Boolean(item[key]))
}

export function findBy<T extends Record<string, unknown>>(
  arr: T[] | undefined | null,
  query: Record<string, unknown>
): T | undefined {
  return (arr ?? []).find(item =>
    Object.entries(query).every(([k, v]) => item[k] === v)
  )
}

export function mapProp<T, K extends keyof T>(arr: T[], key: K): Array<T[K]> {
  return arr.map(item => item[key])
}

export function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}
