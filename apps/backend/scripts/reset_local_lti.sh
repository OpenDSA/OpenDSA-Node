#!/usr/bin/env bash
#
# Reset the local OpenDSA database and configure it for one LTI protocol.
#
# Usage:
#   bash apps/backend/scripts/reset_local_lti.sh --protocol 1.3 --client-id 10000000000059
#   bash apps/backend/scripts/reset_local_lti.sh --protocol 1.1
#
# The 1.3 client id is the Canvas developer-key client id. The Canvas base URL,
# API token, course id, and 1.1 consumer credentials come from
# apps/backend/.env (loaded by the seed/registration scripts).
#
# This script does not start the web/backend containers afterwards. It prints
# the tunnel and Canvas settings you need next.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT/apps/backend"

PROTOCOL="1.3"
CLIENT_ID="${LTI_CLIENT_ID:-${SEED_LTI_CLIENT_ID:-}}"
ORIGIN="${PUBLIC_ORIGIN:-}"
DRY_RUN=0
COMPOSE=(docker compose -f "$ROOT/docker-compose.yml")

usage() {
  cat <<'EOF'
Usage: bash apps/backend/scripts/reset_local_lti.sh [options]

Options:
  --protocol 1.3|1.1   Protocol to configure (default: 1.3)
  --client-id ID        Canvas LTI 1.3 developer-key client id
  --origin URL          Public tunnel/Vite origin, e.g. https://foo.trycloudflare.com
  --dry-run             Print the commands without running them
  --help                Show this help

Environment alternatives:
  LTI_CLIENT_ID or SEED_LTI_CLIENT_ID
  PUBLIC_ORIGIN
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --protocol) PROTOCOL="${2:-}"; shift 2 ;;
    --client-id) CLIENT_ID="${2:-}"; shift 2 ;;
    --origin) ORIGIN="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$PROTOCOL" in
  1.1|1.3) ;;
  *) echo "Protocol must be 1.1 or 1.3." >&2; exit 2 ;;
esac

if [[ "$PROTOCOL" == "1.3" && -z "$CLIENT_ID" ]]; then
  echo "LTI 1.3 needs --client-id (the Canvas developer-key client id)." >&2
  exit 2
fi

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

env_value() {
  node -e 'try { process.loadEnvFile(".env") } catch {}; process.stdout.write(process.env[process.argv[1]] || "")' "$1"
}

CANVAS_URL="$(env_value SEED_CANVAS_URL)"
[[ -n "$CANVAS_URL" ]] || CANVAS_URL="https://lti.cs.vt.edu"
CANVAS_URL="${CANVAS_URL%/}"
CONSUMER_KEY="$(env_value SEED_LTI_CONSUMER_KEY)"
CONSUMER_SECRET="$(env_value SEED_LTI_CONSUMER_SECRET)"
CONSUMER_KEY="${CONSUMER_KEY:-opendsa_consumer_key}"
CONSUMER_SECRET="${CONSUMER_SECRET:-opendsa_consumer_secret}"

echo "Resetting local database for LTI ${PROTOCOL}..."
run "${COMPOSE[@]}" stop backend web >/dev/null 2>&1 || true
run "${COMPOSE[@]}" up -d --wait mysql opendsa
run env NODE_ENV=development npx prisma migrate reset --force --skip-seed
run env NODE_ENV=development npx tsx prisma/seed.ts

if [[ "$PROTOCOL" == "1.3" ]]; then
  echo "Registering LTI 1.3 platform with Canvas ${CANVAS_URL}..."
  run env \
    LTI_LMS_URL="$CANVAS_URL" \
    LTI_ISSUER="$CANVAS_URL" \
    LTI_CLIENT_ID="$CLIENT_ID" \
    LTI_AUTH_URL="${LTI_AUTH_URL:-$CANVAS_URL/api/lti/authorize_redirect}" \
    LTI_TOKEN_URL="${LTI_TOKEN_URL:-$CANVAS_URL/login/oauth2/token}" \
    LTI_JWKS_URL="${LTI_JWKS_URL:-$CANVAS_URL/api/lti/security/jwks}" \
    npm run lti:register
fi

echo
echo "Database reset complete."
echo
if [[ -n "$ORIGIN" ]]; then
  ORIGIN="${ORIGIN%/}"
  cat <<EOF
Set the backend public origin before recreating it:

  BOOKS_PUBLIC_URL=$ORIGIN/Books
  PUBLIC_ORIGIN=$ORIGIN

Then:

  docker compose up -d --force-recreate backend web

For local Canvas iframe exercise requests, add these to apps/backend/.env
and recreate the backend. Use the HTTPS tunnel URL for the UI afterward:

  SESSION_COOKIE_SAMESITE=none
  SESSION_COOKIE_SECURE=true

EOF
else
  cat <<'EOF'
After starting cloudflared/ngrok, update docker-compose.yml's backend environment:

  BOOKS_PUBLIC_URL=https://<your-tunnel>/Books
  PUBLIC_ORIGIN=https://<your-tunnel>

Then recreate the backend and web dev server:

  docker compose up -d --force-recreate backend web

EOF
fi

if [[ "$PROTOCOL" == "1.3" ]]; then
  cat <<EOF
Canvas LTI 1.3 developer-key URLs:

  OIDC initiation: ${ORIGIN:-https://<your-tunnel>}/api/lti13/login_initiations
  Redirect/launch: ${ORIGIN:-https://<your-tunnel>}/api/lti13/launches
  JWKS:            ${ORIGIN:-https://<your-tunnel>}/api/lti13/keys

After the backend is up, verify:

  curl -sS ${ORIGIN:-https://<your-tunnel>}/api/lti13/keys

Expected: one JWK, not {"keys":[]}.
EOF
else
  cat <<EOF
Canvas LTI 1.1 external-tool settings:

  Launch URL: ${ORIGIN:-https://<your-tunnel>}/api/lti/launch
  Consumer key: ${CONSUMER_KEY}
  Shared secret: ${CONSUMER_SECRET}

Add the tool to the Canvas course, then generate the course in the UI.
EOF
fi

cat <<'EOF'
Local instructor login:
  seed-academic-instructor@example.com
  password: SEED_AUTH_PASSWORD from apps/backend/.env

EOF

if [[ "$PROTOCOL" == "1.3" ]]; then
  cat <<'EOF'
After generating the course, launch a gradable assignment and complete one
exercise. Backend logs should show module progress, an AGS line item, and a
submitted score.
EOF
else
  cat <<'EOF'
After generating the course, launch a gradable assignment and complete one
exercise to test the launch and exercise-progress path. LTI 1.1 outcome
passback is not implemented yet; that is the next protocol slice.
EOF
fi
