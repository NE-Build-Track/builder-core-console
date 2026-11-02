"""Optional read-only console credential for the unchanged Railway Batteries startup script."""
import re

READ_PERMISSIONS = (
    "grants.read", "allocations.read", "api_keys.read", "sessions.read",
    "settlements.read", "usage.read", "ledger.read", "escrow.read",
)


def reader_credential(token):
    if not token:
        return ""
    if re.fullmatch(r"[0-9a-f]{64}", token) is None:
        raise ValueError("CONSOLE_READER_TOKEN must be 64 lowercase hex characters")
    allow = ", ".join(f'"{permission}"' for permission in READ_PERMISSIONS)
    return f'\n[[credentials]]\nid = "console-reader"\nsecret = "{token}"\n[credentials.management]\nallow = [{allow}]\n'


def patched_entrypoint(source):
    imports = "from pathlib import Path\n"
    write = '    (secrets / "clearinghouse.toml").write_text(creds, encoding="utf-8")'
    if source.count(imports) != 1 or source.count(write) != 1:
        raise ValueError("Pinned Railway entrypoint changed; review the reader integration before building")
    return source.replace(imports, imports + "from console_reader import reader_credential\n").replace(
        write, '    creds += reader_credential(os.environ.get("CONSOLE_READER_TOKEN", ""))\n' + write,
    )
