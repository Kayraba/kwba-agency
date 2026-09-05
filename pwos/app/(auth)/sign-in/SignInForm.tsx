'use client'

import { useActionState } from 'react'

import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

import { sendMagicLink, type SignInState } from './actions'

const INITIAL: SignInState = { status: 'idle' }

export function SignInForm({ next }: { next?: string | undefined }) {
  const [state, action] = useActionState(sendMagicLink, INITIAL)

  if (state.status === 'sent') {
    return (
      <div
        role="status"
        className="rounded-[var(--radius-card)] border border-border bg-surface-raised p-4"
      >
        <p className="text-sm font-semibold text-ink">Check your email</p>
        <p className="mt-1 text-sm text-ink-muted">{state.message}</p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        id="email"
        name="email"
        label="Email address"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
        required
        placeholder="you@example.com"
        error={state.status === 'error' ? state.message : undefined}
      />
      <SubmitButton size="lg" pendingLabel="Sending…">
        Send me a link
      </SubmitButton>
    </form>
  )
}
