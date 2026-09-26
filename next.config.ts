import { contentBuildId } from '@xayaarcade/sdk/server'
import { networkInterfaces } from 'node:os'
import type { NextConfig } from 'next'

// Rewrite destinations are baked into the standalone build's routes manifest at BUILD time,
// so they are docker build args (see docker/Dockerfile.frontend):
//   WS_PROXY_DESTINATION     same-origin /ws    -> the relay  (default: the compose hostname)
//   CHAIN_PROXY_DESTINATION  same-origin /chain -> the chain RPC (default: absent)
//   GSP_PROXY_DESTINATION    same-origin /gsp   -> the GSP JSON-RPC (default: absent)
// The /chain and /gsp proxies exist for fork-testing deployments and for the browser's blob-loader
// fetch: with NEXT_PUBLIC_POLYGON_RPC=/chain and getGspUrl()'s browser default (/gsp), the
// relevant read is same-origin (CSP connect-src 'self') and no plain-http cross-origin
// exception is needed.
//
// DUAL OUTPUT. NEXT_OUTPUT=export builds a static site (`out/`) instead of the standalone
// server. A static export has NO SERVER, so it has neither rewrites nor middleware: an
// builder-hosted exported build MUST be given absolute endpoints (NEXT_PUBLIC_GSP_URL,
// NEXT_PUBLIC_RELAY_URL, an absolute NEXT_PUBLIC_POLYGON_RPC), and its static host MUST
// serve the security headers itself. Arcade games-host supplies runtime endpoint config
// and embedding headers to an Arcade-hosted bundle.
const isExport = process.env.NEXT_OUTPUT === 'export'

const wsProxyDestination =
  process.env.WS_PROXY_DESTINATION?.trim() || 'http://arcade-relay:8081/'
const chainProxyDestination = process.env.CHAIN_PROXY_DESTINATION?.trim() || ''
const gspProxyDestination = process.env.GSP_PROXY_DESTINATION?.trim() || ''

// A phone on the same Wi-Fi opens the dev server through this machine's LAN IP.
// Next blocks its own JS chunks for that host unless it is explicitly allowed.
const lanDevOrigins = Object.values(networkInterfaces()).flatMap((interfaces) =>
  (interfaces ?? []).filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address),
)

// PATH-BASED SERVING. When the arcade serves this bundle under a sub-path
// (arcade.xaya.io/g/<slug>/), every root-absolute reference - /_next/, links, RSC URLs -
// must carry that prefix, which is exactly what Next's `basePath` rewrites at BUILD time.
// Builders never set this var by hand: scripts/build-export.sh --bundle bakes the FIXED
// placeholder NEXT_PUBLIC_BASE_PATH=/__arcade_base__, and the platform rewrites that token
// to /g/<slug> when the game is registered - the builder never sees or chooses their path.
// Unset (dev servers, the docker standalone flavour) => no basePath, today's root build
// byte-for-byte. No assetPrefix: basePath alone covers /_next/, links and RSC; assetPrefix
// is only for a separate CDN host.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim()
if (basePath !== undefined && basePath !== '' && (!basePath.startsWith('/') || basePath.endsWith('/'))) {
  throw new Error(
    `NEXT_PUBLIC_BASE_PATH must start with '/' and must not end with '/' (got '${basePath}')`,
  )
}

const nextConfig: NextConfig = {
  generateBuildId: async () => contentBuildId(),
  reactCompiler: true,
  reactStrictMode: false, // preserves the SDK channel component's mount lifecycle
  output: isExport ? 'export' : 'standalone',
  allowedDevOrigins: [...new Set([
    'localhost',
    ...lanDevOrigins,
    ...(process.env.NEXT_DEV_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
  ])],
  ...(basePath ? { basePath } : {}),
  ...(isExport
    ? {}
    : {
        async rewrites() {
          return {
            beforeFiles: [
              { source: '/ws', destination: wsProxyDestination },
              ...(chainProxyDestination
                ? [{ source: '/chain', destination: chainProxyDestination }]
                : []),
              ...(gspProxyDestination
                ? [{ source: '/gsp', destination: gspProxyDestination }]
                : []),
            ],
            afterFiles: [],
            fallback: [],
          }
        },
      }),
}

export default nextConfig
