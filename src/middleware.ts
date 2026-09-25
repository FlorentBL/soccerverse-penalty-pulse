import { NextRequest, NextResponse } from 'next/server';
import { buildSecurityHeaders } from '@xayaarcade/sdk';

// FRAME_ANCESTORS is a RUNTIME env var on the standalone container (middleware runs in the
// server, so changing it is a restart, not a rebuild): unset keeps the hard no-frame stance
// (X-Frame-Options: DENY); a value (the Arcade origin) drops XFO and adds CSP
// frame-ancestors so that origin - and only that origin - can embed us.
//
// STATIC EXPORT: Next has no middleware without a server. `output: 'export'` silently drops
// this middleware from the build, so scripts/build-export.sh emits the same header set as
// files the static host serves (out/_headers, out/nginx-headers.conf). Keep the two in step.
const SECURITY_HEADERS = buildSecurityHeaders(process.env.FRAME_ANCESTORS);

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|wasm).*)'],
};
