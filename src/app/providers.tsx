'use client';

// Importing the bootstrap IS the bootstrap (module-scope side effect). This module is
// evaluated in BOTH module graphs - the browser bundle and the server (Next SSRs the client
// tree; `output: 'export'` prerenders it at build time) - so this single import guarantees
// configureApp() + registerAdapter() have run before any SDK component in this tree renders.
// See src/bootstrap.ts for what breaks otherwise.
import '@/bootstrap';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider } from 'connectkit';
import {
  wagmiConfig,
  ToastProvider,
  ArcadeBridgeProvider,
  ErrorBoundary,
  RuntimeConfigGate,
  ImmersiveOnChannel,
} from '@xayaarcade/sdk';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // RuntimeConfigGate goes OUTSIDE WagmiProvider, not inside it: wagmiConfig is built
    // lazily on first real read (see the SDK's wagmi-config comment), and that first read
    // happens the moment WagmiProvider mounts. Gating anywhere inside this tree would let
    // WagmiProvider - and therefore every hook under it - run before /arcade-config.json
    // has resolved.
    <RuntimeConfigGate>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ConnectKitProvider>
            <ToastProvider>
              {/* ErrorBoundary lives HERE, not in layout.tsx: layout is a server component
                  and this is a client class component with componentDidCatch. */}
              <ErrorBoundary>
                {/* Inert unless embedded in the arcade. When embedded it owns the identity +
                    move bridge (the game holds no wallet of its own), AND the whole
                    presentation contract: it announces this adapter's `presentation` to the
                    shell, applies any arcade:theme the shell sends, and exposes
                    requestChrome()/chromeHidden through useArcadeBridge(). The game does not
                    reimplement any of that - see the SDK bridge documentation. */}
                <ArcadeBridgeProvider>
                  <ImmersiveOnChannel />
                  {children}
                </ArcadeBridgeProvider>
              </ErrorBoundary>
            </ToastProvider>
          </ConnectKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </RuntimeConfigGate>
  );
}
