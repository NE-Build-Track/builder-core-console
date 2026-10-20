"""Create the payment stack's service secrets, or add the console's reader to secrets copied from ChatLPT.

Adapted from ChatLPT's deploy/init-secrets.py. Two cases (deploy/README.md#secrets):

- deploy/secrets/ is empty: write every Batteries credential ChatLPT writes (operator, a least-privilege
  engine credential, the grant desk, the signer webhook, Kafka users) plus `console-reader`.
- deploy/secrets/ already holds clearinghouse.toml (for example, copied from ChatLPT so both stacks use the
  same values): append the `console-reader` credential if it is missing and write its token. Nothing else
  is touched.

`console-reader` may only read. It is the console's Batteries credential and never gets a write permission.
Then copy the payer keystore in, if this is a fresh directory:

    cp ~/.livepeer/keys/cloud-spe-gateway/key.json      deploy/secrets/keystore.json
    cp ~/.livepeer/keys/cloud-spe-gateway/key.password  deploy/secrets/keystore-password
    printf '%s' 'https://arb1...' > deploy/secrets/rpc-url
    chmod 600 deploy/secrets/*
"""

import os
import secrets
import tomllib
from pathlib import Path

READER_ID = "console-reader"
READER_ALLOW = [
    "grants.read",
    "allocations.read",
    "api_keys.read",
    "sessions.read",
    "settlements.read",
    "usage.read",
    "ledger.read",
    "escrow.read",
]


def reader_block(secret: str) -> str:
    allow = ", ".join(f'"{name}"' for name in READER_ALLOW)
    return f'''
[[credentials]]
id = "{READER_ID}"
secret = "{secret}"
[credentials.management]
allow = [{allow}]
'''


def fresh(target: Path) -> None:
    operator, engine, grant_desk, webhook, reader, producer, console = (
        secrets.token_hex(32) for _ in range(7)
    )
    creds = f'''[[credentials]]
id = "operator"
secret = "{operator}"
[credentials.management]
allow = ["grants.*", "allocations.*", "api_keys.*", "sessions.*",
         "settlements.read", "usage.read", "ledger.read", "escrow.read"]

[[credentials]]
id = "builder-engine"
secret = "{engine}"
[credentials.management]
allow = ["grants.fund", "allocations.create", "allocations.fund", "allocations.read",
         "allocations.status", "allocations.revoke", "api_keys.create", "api_keys.read",
         "api_keys.revoke", "usage.read"]

[[credentials]]
id = "grant-desk"
secret = "{grant_desk}"
[credentials.management]
allow = ["grants.read", "grants.create"]

[[credentials]]
id = "signer"
secret = "{webhook}"
[credentials.webhook]
authorize = true

[[credentials]]
id = "accounting"
secret = "{reader}"
[credentials.kafka]
username = "accounting"
allow = ["read"]
accounting = true

[[credentials]]
id = "producer"
secret = "{producer}"
[credentials.kafka]
username = "producer"
allow = ["write"]
''' + reader_block(console)
    files = {
        "clearinghouse.toml": creds,
        "operator-token": operator,
        "engine-token": engine,
        "grant-desk-token": grant_desk,
        "console-reader-token": console,
        "webhook-headers": f"Livepeer-Clearinghouse-Token:{webhook}",
        "webhook-url": "http://127.0.0.1:8080/v1/signer/authorize",
        "kafka-username": "producer",
        "kafka-password": producer,
    }
    for name, value in files.items():
        (target / name).write_text(value)
    print(
        "Created deploy/secrets/. Now add rpc-url, keystore.json and keystore-password "
        "(mode 0600; password without a trailing newline), then run deploy/first-run.sh."
    )


def add_reader(target: Path) -> None:
    creds_file = target / "clearinghouse.toml"
    creds = creds_file.read_text()
    ids = {item.get("id") for item in tomllib.loads(creds).get("credentials", [])}
    token_file = target / "console-reader-token"
    if READER_ID in ids:
        if not token_file.exists():
            raise SystemExit(
                f"{creds_file} has a {READER_ID} credential but {token_file} is missing; "
                "remove that credential block and run this again"
            )
        print(f"{READER_ID} already exists; nothing to do")
        return
    secret = secrets.token_hex(32)
    creds_file.write_text(creds.rstrip("\n") + "\n" + reader_block(secret))
    token_file.write_text(secret)
    print(f"Added the {READER_ID} credential (read-only) to {creds_file}. Restart clearinghouse to load it.")


def main() -> None:
    os.umask(0o077)
    target = Path(__file__).resolve().parent / "secrets"
    target.mkdir(mode=0o700, exist_ok=True)
    if (target / "clearinghouse.toml").exists():
        add_reader(target)
    elif any(target.iterdir()):
        raise SystemExit("deploy/secrets/ has files but no clearinghouse.toml; refusing to guess")
    else:
        fresh(target)


if __name__ == "__main__":
    main()
