// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Meter } from '../Meter'
import { Money } from '../Money'

afterEach(cleanup)

describe('<Money>', () => {
  it('colours by sign unless told otherwise', () => {
    const { container } = render(
      <>
        <Money minor={1250} />
        <Money minor={-1250} />
        <Money minor={0} />
      </>,
    )
    const spans = container.querySelectorAll('span')
    expect(spans[0]?.className).toContain('text-positive')
    expect(spans[1]?.className).toContain('text-negative')
    expect(spans[2]?.className).toContain('text-ink-muted')
  })

  it('renders a recorded figure with no calculation marker', () => {
    const { container } = render(<Money minor={1250} />)
    const span = container.querySelector('span')!
    expect(span.className).not.toContain('calculated')
    expect(span.hasAttribute('title')).toBe(false)
  })

  it('marks a calculated figure and says where it came from', () => {
    // CLAUDE.md rule 5: a figure PWOS worked out must not look like one the
    // user recorded, and must be able to say what produced it.
    const { container } = render(
      <Money minor={-4200} calculated source="Balance plus the arranged overdraft limit" />,
    )
    const span = container.querySelector('span')!
    expect(span.className).toContain('calculated')
    expect(span.getAttribute('title')).toBe('Balance plus the arranged overdraft limit')
  })

  it('uses tabular figures so columns line up', () => {
    const { container } = render(<Money minor={1250} />)
    expect(container.querySelector('span')!.className).toContain('tabular')
  })
})

describe('<Meter>', () => {
  it('exposes the proportion to assistive technology', () => {
    render(<Meter value={0.42} label="Overdraft used" />)
    const meter = screen.getByRole('meter')
    expect(meter.getAttribute('aria-valuenow')).toBe('42')
    expect(meter.getAttribute('aria-valuetext')).toBe('42%')
  })

  it('clamps rather than overflowing', () => {
    render(<Meter value={1.8} label="Over" />)
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('100')
  })

  it('says it does not know instead of showing an empty bar', () => {
    render(<Meter value={null} label="Runway" />)
    const meter = screen.getByRole('meter')
    expect(meter.hasAttribute('aria-valuenow')).toBe(false)
    expect(meter.getAttribute('aria-valuetext')).toBe('Not enough data')
    expect(screen.getByText('Not enough data yet')).toBeTruthy()
  })
})
