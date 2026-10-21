#!/usr/bin/env bash
# One-time bootstrap (deploy/README.md#first-run). Fills the empty values in deploy/.env:
#   LPB_BATTERIES_TOKEN, LPB_BATTERIES_OPERATOR_TOKEN  from deploy/secrets (the same values ChatLPT uses)
#   CONSOLE_BATTERIES_TOKEN                            from deploy/secrets/console-reader-token (read-only)
#   LPB_SECRET_KEY                                     from `lpb gen-secret-key`
#   CONSOLE_ENGINE_ADMIN_TOKEN                         from `lpb bootstrap-admin` (printed once by the engine)
#   CONSOLE_SESSION_SECRET                             random, seals the Operator and Builder sign-ins (D16)
# Values that are already set are kept. It never starts the signer, so it is safe while ChatLPT runs (D3).
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "copy .env.example to .env first" >&2; exit 1; }
[ -f secrets/clearinghouse.toml ] || { echo "run deploy/init-secrets.py first" >&2; exit 1; }
[ -f secrets/console-reader-token ] || { echo "run deploy/init-secrets.py to add the console reader" >&2; exit 1; }

current() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//' | tr -d '[:space:]'; }
put() {
  python3 - "$ENV_FILE" "$1" "$2" <<'PY'
import re, sys, pathlib
path, name, value = sys.argv[1:]
text = pathlib.Path(path).read_text()
line = f"{name}={value}"
text, n = re.subn(rf"^{re.escape(name)}=.*$", lambda _: line, text, flags=re.M)
if n == 0:
    text = text.rstrip("\n") + f"\n{line}\n"
pathlib.Path(path).write_text(text)
PY
  echo "set $1"
}
fill_from() { [ -n "$(current "$1")" ] || put "$1" "$(cat "secrets/$2")"; }

fill_from LPB_BATTERIES_TOKEN engine-token
fill_from LPB_BATTERIES_OPERATOR_TOKEN grant-desk-token
fill_from CONSOLE_BATTERIES_TOKEN console-reader-token
chmod 600 "$ENV_FILE"

engine() { docker compose run --rm --no-deps -T engine "$@"; }
if [ -z "$(current LPB_SECRET_KEY)" ]; then
  put LPB_SECRET_KEY "$(engine lpb gen-secret-key | tail -1)"
fi
if [ -z "$(current CONSOLE_SESSION_SECRET)" ]; then
  put CONSOLE_SESSION_SECRET "$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
fi
if [ -z "$(current CONSOLE_ENGINE_ADMIN_TOKEN)" ]; then
  echo "issuing the engine admin key (shown once by the engine; stored only in $ENV_FILE)…"
  TOKEN=$(engine lpb bootstrap-admin --label console | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
  put CONSOLE_ENGINE_ADMIN_TOKEN "$TOKEN"
fi
chmod 600 "$ENV_FILE"
echo "done. Start the stack with: make up   (stop ChatLPT's stack first: one signer per payer account)"
