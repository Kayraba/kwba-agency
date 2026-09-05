import { expect, test } from '@playwright/test'

/**
 * The sign-in path, at phone width.
 *
 * The first three tests need nothing but the app running — they cover the gate
 * and the fact that an address that is not the permitted one gets exactly the
 * same answer as one that is. The full magic-link round trip needs a real
 * Supabase project and is opt-in; see README.
 */

test.describe('sign-in', () => {
  test('an unauthenticated visitor is sent to sign-in', async ({ page }) => {
    await page.goto('/position')
    await expect(page).toHaveURL(/\/sign-in/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('the form works one-handed at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/sign-in')

    const email = page.getByLabel('Email address')
    await expect(email).toBeVisible()
    await expect(email).toHaveAttribute('type', 'email')
    await expect(email).toHaveAttribute('inputmode', 'email')

    const submit = page.getByRole('button', { name: 'Send me a link' })
    const box = await submit.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

    // Nothing should push the page sideways on a narrow screen.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('an address that cannot sign in gets the same answer as one that can', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email address').fill('someone-else@example.com')
    await page.getByRole('button', { name: 'Send me a link' }).click()

    await expect(page.getByText('Check your email')).toBeVisible()
    // No hint that the address was rejected, and no session either.
    await page.goto('/position')
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('a broken link lands on a page that explains itself', async ({ page }) => {
    await page.goto('/auth/callback')
    await expect(page).toHaveURL(/\/auth\/error/)
    await expect(page.getByRole('heading', { name: 'Not signed in' })).toBeVisible()
  })
})

/**
 * The real round trip. Needs a scratch project:
 *
 *   PWOS_E2E_URL, PWOS_E2E_SERVICE_ROLE_KEY, PWOS_E2E_EMAIL
 *
 * where PWOS_E2E_EMAIL matches the app's PWOS_ALLOWED_EMAIL.
 */
const liveConfigured = Boolean(
  process.env.PWOS_E2E_URL &&
    process.env.PWOS_E2E_SERVICE_ROLE_KEY &&
    process.env.PWOS_E2E_EMAIL,
)

test.describe('sign-in, end to end', () => {
  test.skip(!liveConfigured, 'needs a scratch Supabase project')

  test('a magic link signs you in and lands on Position', async ({ page, baseURL }) => {
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(process.env.PWOS_E2E_URL!, process.env.PWOS_E2E_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: process.env.PWOS_E2E_EMAIL!,
      options: { redirectTo: `${baseURL}/auth/callback` },
    })
    expect(error).toBeNull()

    await page.goto(data!.properties!.action_link)
    await expect(page).toHaveURL(/\/position/)
    await expect(page.getByRole('heading', { name: 'Position' })).toBeVisible()

    await page.getByRole('link', { name: 'More' }).click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in/)
  })
})
