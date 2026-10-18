/**
 * Leave-page guard for unpublished firmware or a GitHub host snapshot.
 * IndexedDB recovery and host-install status are not this predicate.
 * The handler must not save or publish; it only arms the browser dialog.
 * `saving` deliberately neither arms nor suppresses the warning: an in-flight
 * save/copy can fail, and only its accepted baseline can clear the sent work.
 * See CHG-002's acceptance matrix row "Failed save/copy/reload, or edits during
 * an in-flight save" in docs/changes/archive/CHG-002-warn-before-leaving-unpublished-work.md.
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
