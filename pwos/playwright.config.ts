import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PWOS_E2E_BASE_URL ?? 'http://localhost:3000'

// CI images often ship a pinned Chromium that does not match the one this
// version of Playwright would download. Point at it rather than fetching a
// second copy: PWOS_E2E_CHROMIUM=/path/to/chrome.
const executablePath = process.env.PWOS_E2E_CHROMIUM

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    // The app is used on a phone, so that is the viewport the tests run at.
    // Chromium rather than WebKit: it is the engine available on CI here, and
    // the sign-in path has nothing engine-specific in it.
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  ...(process.env.PWOS_E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'npm run build && npm run start',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }),
})
