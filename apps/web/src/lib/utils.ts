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

export function compact<T>(arr: Array<T | null | undefined | false | 0 | ''>): T[] {
  return arr.filter(Boolean) as T[]
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
