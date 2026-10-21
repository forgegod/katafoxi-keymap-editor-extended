export class KeymapValidationError extends Error {
  errors: string[]

  constructor(errors: string[]) {
    super(errors.join('; '))
    this.name = 'KeymapValidationError'
    this.errors = errors
  }
}

/**
 * Optional diagnostic identity, not path authority. File adapters supply the
 * exact repository-relative path, never an absolute local filesystem path.
 * Bare validation preserves the existing path-free error contract.
 */
export class InfoValidationError extends Error {
  errors: string[]
  path?: string

  constructor(errors: string[], path?: string) {
    super(errors.join('; '))
    this.name = 'InfoValidationError'
    this.errors = errors
    this.path = path
  }
}
