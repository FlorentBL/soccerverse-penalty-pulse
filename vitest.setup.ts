// Global Vitest setup for the jsdom React test environment.
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// The bootstrap the real app runs: configureApp() + registerAdapter(). Every module that
// reads appConfig() (storage keys, the wasm loader's move namespace, the shared screens'
// title) needs one configured, exactly as a page render would. Importing it IS the
// bootstrap; it is idempotent, so vitest's per-file module graph re-runs it harmlessly.
import '@/bootstrap'

afterEach(() => {
  cleanup()
})

// ── jsdom gaps that React Testing Library / wagmi / connectkit commonly trip on ──

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    root = null
    rootMargin = ''
    thresholds: ReadonlyArray<number> = []
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
}
