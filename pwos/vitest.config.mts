import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['{lib,features,components,tests}/**/*.test.{ts,tsx}'],
    // The RLS suite talks to a real Supabase project and is opt-in; see README.
    exclude: ['node_modules/**', 'tests/e2e/**'],
  },
})
