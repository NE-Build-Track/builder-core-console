#!/usr/bin/env bash
# Build the stack's images from pinned sources. Never pushes. IMAGE_REGISTRY (from deploy/.env or the
# environment) prefixes the names; leave it empty for local-only names.
#   scripts/build-images.sh                  # every image
#   scripts/build-images.sh engine console   # some of them
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f deploy/.env ]; then
  IMAGE_REGISTRY="$( { grep -E '^IMAGE_REGISTRY=' deploy/.env || true; } | cut -d= -f2- | tr -d '[:space:]')"
fi
export IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"
SERVICES=("$@")
[ ${#SERVICES[@]} -eq 0 ] && SERVICES=(clearinghouse signer engine console)
echo "registry prefix: '${IMAGE_REGISTRY}'"
for svc in "${SERVICES[@]}"; do
  echo "== building $svc"
  docker compose -f deploy/compose.yaml build --pull "$svc"
done
docker images --format '{{.Repository}}:{{.Tag}}  {{.Size}}' | grep -E "builder-console/" || true
echo "built. Publish explicitly with: docker compose -f deploy/compose.yaml push <service>"
