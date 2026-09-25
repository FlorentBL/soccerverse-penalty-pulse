#!/usr/bin/env bash
# Build this game's frontend image and print the FRONTEND_IMAGE line the ARCADE PLATFORM's
# docker/.env needs.
#
# The platform's compose declares
#   image: ${FRONTEND_IMAGE:?set FRONTEND_IMAGE to a game repo's built frontend image}
# and builds no frontend of its own - a game's website is the game's own artifact, with the
# game's own NEXT_PUBLIC_* baked in at THIS repo's build time. This script is the only thing
# that satisfies that variable.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

SHA="$(git rev-parse --short HEAD)"
# Default the image name off the npm package name (package.json "name") so a fork that renames
# the package gets a matching image tag with no edit here. Override with TAG=... if you want.
PKG_NAME="$(node -p "require('./package.json').name")"
TAG="${TAG:-$PKG_NAME-frontend:$SHA}"

# Provenance attestations churn the image id on every build, which makes `docker compose up
# --build` recreate containers that did not change.
export BUILDX_NO_DEFAULT_ATTESTATIONS=1

docker build -f docker/Dockerfile.frontend -t "$TAG" \
  --build-arg "NEXT_PUBLIC_GAME_ID=${NEXT_PUBLIC_GAME_ID:-svpenaltypulse}" \
  --build-arg "NEXT_PUBLIC_POLYGON_RPC=${NEXT_PUBLIC_POLYGON_RPC:-}" \
  --build-arg "NEXT_PUBLIC_WC_PROJECT_ID=${NEXT_PUBLIC_WC_PROJECT_ID:-}" \
  --build-arg "NEXT_PUBLIC_DEV_WALLET=${NEXT_PUBLIC_DEV_WALLET:-}" \
  --build-arg "NEXT_PUBLIC_ARCADE_ORIGIN=${NEXT_PUBLIC_ARCADE_ORIGIN:-}" \
  --build-arg "WS_PROXY_DESTINATION=${WS_PROXY_DESTINATION:-http://arcade-relay:8081/}" \
  --build-arg "CHAIN_PROXY_DESTINATION=${CHAIN_PROXY_DESTINATION:-}" \
  --build-arg "GSP_PROXY_DESTINATION=${GSP_PROXY_DESTINATION:-}" \
  .

cat <<EOF

built $TAG

Put this in the PLATFORM repo's docker/.env (arcade-platform/docker/.env):

    FRONTEND_IMAGE=$TAG
    GAME_ID=${NEXT_PUBLIC_GAME_ID:-svpenaltypulse}

GAME_ID there and NEXT_PUBLIC_GAME_ID here MUST be the same string, or the GSP watches one
\`g/\` namespace while the site posts moves to another.
Then, from the platform repo: cd docker && docker compose up -d
EOF
