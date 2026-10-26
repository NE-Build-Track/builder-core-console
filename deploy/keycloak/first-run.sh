#!/usr/bin/env bash
# Writes deploy/keycloak/.env once: Keycloak's bootstrap admin, the two client secrets, the demo users'
# password and the console's session secret. Values already set are kept. See README.md here.
set -euo pipefail
cd "$(dirname "$0")"
touch .env && chmod 600 .env
current() { { grep -E "^$1=" .env || true; } | tail -1 | cut -d= -f2-; }
put() { [ -n "$(current "$1")" ] || { echo "$1=$2" >> .env; echo "set $1"; }; }
random() { python3 -c "import secrets; print(secrets.token_urlsafe($1))"; }
put KC_BOOTSTRAP_ADMIN_USERNAME admin
put KC_BOOTSTRAP_ADMIN_PASSWORD "$(random 18)"
put BUILDER_CONSOLE_CLIENT_SECRET "$(random 32)"
put CONSOLE_READER_CLIENT_SECRET "$(random 32)"
put DEMO_PASSWORD "$(random 12)"
put CONSOLE_SESSION_SECRET "$(random 48)"
echo "demo users operator, alice, bob share DEMO_PASSWORD in deploy/keycloak/.env"
