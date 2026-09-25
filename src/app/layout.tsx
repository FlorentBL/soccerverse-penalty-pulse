import type { Metadata, Viewport } from 'next'
// Belt and braces: the RSC graph bootstraps too, closing the hole where a future route
// renders SDK code without going through <Providers>. Idempotent.
import '@/bootstrap'
import { TITLE } from '@/app-identity'
import { Providers } from './providers'
import './globals.css'

// Page metadata reads the game's display name from the one identity source (src/app-identity.ts)
// - a fork re-titles there and this follows, no second edit. The description is templated off the
// same TITLE so it stays generic and never re-states the brand.
export const metadata: Metadata = {
  title: TITLE,
  description: `Turn-based ${TITLE} - a Xaya game channel`,
}

// viewportFit: 'cover' is the notched-phone half of presentation rule 1; the HUD pads itself
// with env(safe-area-inset-*).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* No w-screen/h-screen: html+body size to the CONTAINER in globals.css (presentation
          rule 1 - a bare 100vh lies inside a frame and on iOS). */}
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
