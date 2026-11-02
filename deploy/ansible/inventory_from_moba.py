#!/usr/bin/env python3
"""Extract one SSH bookmark into a PRIVATE inventory; never copy the session or credentials into Git."""

import argparse
import ipaddress
import json
from pathlib import Path
import re
import sys


def connection(text):
    line = next((line for line in text.splitlines() if "=" in line), "")
    fields = re.split(r"[%#]", line.split("=", 1)[1]) if line else []
    # MobaXterm SSH bookmarks start #109#0%host%port%user%...
    if len(fields) < 6 or fields[1:3] != ["109", "0"]:
        raise ValueError("Expected a single MobaXterm SSH bookmark")
    host, port, user = fields[3:6]
    ipaddress.ip_address(host)
    if not port.isdigit() or not 1 <= int(port) <= 65535 or not re.fullmatch(r"[a-z_][a-z0-9_-]*", user):
        raise ValueError("Invalid SSH port or user")
    return {"ansible_host": host, "ansible_port": int(port), "ansible_user": user}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session", type=Path)
    parser.add_argument("--identity-file", required=True, type=Path, help="Converted OpenSSH private key; never a .ppk")
    parser.add_argument("--output", required=True, type=Path, help="Private inventory outside version control")
    args = parser.parse_args()
    try:
        if args.identity_file.suffix.lower() == ".ppk":
            raise ValueError("Convert the PuTTY key to OpenSSH first; the session does not contain the private key")
        host = connection(args.session.read_text(encoding="utf-8-sig"))
        host["ansible_ssh_private_key_file"] = str(args.identity_file.resolve())
        host["ansible_ssh_common_args"] = "-o StrictHostKeyChecking=yes"
        args.output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with args.output.open("x", encoding="utf-8") as output:
            output.write(json.dumps({"all": {"children": {"builder": {"hosts": {"builder_host": host}}}}}, indent=2) + "\n")
        args.output.chmod(0o600)
        print("Private inventory created. Verify the SSH host fingerprint before connecting.")
    except (OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
