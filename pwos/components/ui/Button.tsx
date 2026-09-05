import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-90 active:opacity-80',
  secondary:
    'bg-surface-raised text-ink border border-border hover:border-border-strong active:bg-surface-sunken',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-sunken',
  danger: 'bg-negative-soft text-negative border border-negative/40 hover:opacity-90',
}

const SIZES: Record<Size, string> = {
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3.5 text-base w-full',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium',
        'transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}
