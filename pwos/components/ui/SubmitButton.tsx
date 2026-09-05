'use client'

import { useFormStatus } from 'react-dom'

import { Button, type ButtonProps } from './Button'

/**
 * A submit button that disables itself and says what it is doing while the
 * server action runs. Every mutation in PWOS uses this, so no form can be
 * double-submitted by an impatient thumb.
 */
export function SubmitButton({
  children,
  pendingLabel = 'Saving…',
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  )
}
