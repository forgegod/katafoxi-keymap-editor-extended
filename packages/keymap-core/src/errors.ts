export class KeymapValidationError extends Error {
  errors: string[]

  constructor(errors: string[]) {
    super(errors.join('; '))
    this.name = 'KeymapValidationError'
    this.errors = errors
  }
}

export class InfoValidationError extends Error {
  errors: string[]

  constructor(errors: string[]) {
    super(errors.join('; '))
    this.name = 'InfoValidationError'
    this.errors = errors
  }
}
