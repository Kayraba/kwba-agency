import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { NextConfig } from 'next'

// PWOS lives in a subdirectory of a repository that has its own lockfile, so
// Next has to be told where this app's root is. Without this it infers the
// parent and traces the wrong files.
const root = path.dirname(fileURLToPath(import.meta.url))

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: root,
  turbopack: { root },
}

export default config
