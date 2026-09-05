/**
 * The shape every server action returns.
 *
 * Actions never throw at the client. They come back with either `ok: true` or a
 * message and, for a validation failure, the per-field errors the form needs to
 * render. `useActionState` hands this straight to the component.
 */

export type FieldErrors = Record<string, string>

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; message: string; fieldErrors?: FieldErrors }

export const idle: ActionResult = { ok: true }

export function failure(message: string, fieldErrors?: FieldErrors): ActionResult<never> {
  return fieldErrors ? { ok: false, message, fieldErrors } : { ok: false, message }
}

export function success<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, ...(data !== undefined ? { data } : {}), ...(message ? { message } : {}) }
}

/** Flattens a Zod error into the field map the forms use. First message per field wins. */
export function fieldErrorsFrom(issues: readonly { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_')
    if (!(key in errors)) errors[key] = issue.message
  }
  return errors
}
