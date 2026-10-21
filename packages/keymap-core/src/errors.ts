export class KeymapValidationError extends Error {
  errors: string[]

  constructor(errors: string[]) {
    super(errors.join('; '))
    this.name = 'KeymapValidationError'
    this.errors = errors
  }
}

/**
 * CHG-011 phase-1 proposal, NOT implemented: add optional `path?: string` via
 * constructor(errors: string[], path?: string), preserving name/errors/message
 * and existing one-argument callers. Path is diagnostic identity, not authority:
 * adapters supply the exact repo-relative config path, never an absolute local
 * filesystem path. File validation and JSON syntax failures retain that identity.
 * GitHub's keyboard-files route will serialize { name, errors, path }; its web
 * API and Picker loadError will retain path for ValidationErrors to display as
 * text, using the legacy title-based fallback only when path is absent. Local
 * service errors carry the relative path; its sanitized HTTP contract stays put.
 * Transport/UI wiring and tests belong to later phases, not this declaration.
 */
export class InfoValidationError extends Error {
  errors: string[]

  constructor(errors: string[]) {
    super(errors.join('; '))
    this.name = 'InfoValidationError'
    this.errors = errors
  }
}
