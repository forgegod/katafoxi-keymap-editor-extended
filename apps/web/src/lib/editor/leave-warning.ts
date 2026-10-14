/**
 * Leave-page guard for unpublished firmware or a GitHub host snapshot.
 * IndexedDB recovery and host-install status are not this predicate.
 * The handler must not save or publish; it only arms the browser dialog.
 */

export type UnpublishedLeaveState = {
  readonly isDirty: boolean
  readonly isHostRepoDirty: boolean
  readonly hasLocalHostRecovery?: boolean
  readonly hasPendingFirmwareRecovery?: boolean
}

export function needsUnpublishedLeaveWarning(state: UnpublishedLeaveState): boolean {
  return state.isDirty || state.isHostRepoDirty || !!state.hasLocalHostRecovery || !!state.hasPendingFirmwareRecovery
}

export function armBeforeUnloadConfirmation(event: BeforeUnloadEvent): void {
  event.preventDefault()
  event.returnValue = ''
}
