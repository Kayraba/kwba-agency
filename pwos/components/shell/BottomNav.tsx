'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/position', label: 'Position', glyph: '◎' },
  { href: '/money', label: 'Money', glyph: '≡' },
  { href: '/ladder', label: 'Ladder', glyph: '⌃' },
  { href: '/portfolio', label: 'Portfolio', glyph: '◈' },
  { href: '/more', label: 'More', glyph: '⋯' },
] as const

/**
 * Fixed bottom navigation. Thumb-reachable on a 375px screen, which is where
 * this app is actually used.
 */
export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex h-[var(--spacing-nav)] flex-col items-center justify-center gap-1',
                  'text-[11px] font-medium transition-colors',
                  active ? 'text-accent' : 'text-ink-faint hover:text-ink-muted',
                ].join(' ')}
              >
                <span aria-hidden className="text-lg leading-none">
                  {item.glyph}
                </span>
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
