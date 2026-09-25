import { fileURLToPath } from 'node:url'
import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// React component / hook tests, plus the repo guards.
//
// Separate from the C++ and WASM gates under blob/tests/. Vitest specs live ONLY under
// tests/ - that dir is never copied into the Docker image and is excluded from the app
// tsconfig, so the production `next build` never depends on the test toolchain.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror the tsconfig `@/* -> ./src/*` alias. Set explicitly (rather than via
    // vite-tsconfig-paths) because the tsconfig has no `baseUrl`.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: [...configDefaults.exclude, '.next/**'],
  },
})
