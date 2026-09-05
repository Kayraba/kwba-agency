import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: { default: 'PWOS', template: '%s · PWOS' },
  description: 'Personal Wealth Operating System.',
  applicationName: 'PWOS',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'PWOS' },
  // Single-user app. Nothing here should ever be indexed.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The quick-add keypad must not zoom the page when it opens.
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfd' },
    { media: '(prefers-color-scheme: dark)', color: '#16171c' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
