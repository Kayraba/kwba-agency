import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

const CONTROL =
  'w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-base text-ink ' +
  'placeholder:text-ink-faint focus:border-accent focus:outline-2 focus:outline-offset-0 ' +
  'focus:outline-accent disabled:opacity-50'

function Wrapper({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | undefined
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-sm text-negative">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
  hint?: ReactNode
  error?: string | undefined
  id: string
  /** React 19 passes refs as a plain prop; declared here so callers can focus the input. */
  ref?: Ref<HTMLInputElement>
}

export function Field({ label, hint, error, id, className = '', ...props }: FieldProps) {
  return (
    <Wrapper label={label} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={[CONTROL, error ? 'border-negative' : '', className].join(' ')}
        {...props}
      />
    </Wrapper>
  )
}

/**
 * A money input. `inputmode="decimal"` is what raises the numeric keypad on iOS
 * and Android — the whole quick-add flow depends on it, so it is not optional.
 */
export function MoneyField({
  label,
  hint,
  error,
  id,
  currencySymbol = '£',
  className = '',
  ...props
}: FieldProps & { currencySymbol?: string }) {
  return (
    <Wrapper label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted">
          {currencySymbol}
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={[CONTROL, 'pl-8', error ? 'border-negative' : '', className].join(' ')}
          {...props}
        />
      </div>
    </Wrapper>
  )
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode
  hint?: ReactNode
  error?: string | undefined
  id: string
  children: ReactNode
}

export function SelectField({
  label,
  hint,
  error,
  id,
  className = '',
  children,
  ...props
}: SelectFieldProps) {
  return (
    <Wrapper label={label} hint={hint} error={error} htmlFor={id}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={[CONTROL, 'appearance-none', error ? 'border-negative' : '', className].join(' ')}
        {...props}
      >
        {children}
      </select>
    </Wrapper>
  )
}

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode
  hint?: ReactNode
  error?: string | undefined
  id: string
}

export function TextAreaField({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}: TextAreaFieldProps) {
  return (
    <Wrapper label={label} hint={hint} error={error} htmlFor={id}>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={[CONTROL, error ? 'border-negative' : '', className].join(' ')}
        {...props}
      />
    </Wrapper>
  )
}
