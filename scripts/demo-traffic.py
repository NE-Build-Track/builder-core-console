#!/usr/bin/env python3
"""Put demo traffic through the stack: grants, actors with their own allocations and keys, and paid jobs.

THIS SPENDS REAL MONEY. Every job is paid by the signer from the payer's TicketBroker deposit (the same
payer as ChatLPT). The amounts are small: a short chat or embedding job costs about $0.0001-$0.001,
and each actor's allocation caps what that actor can spend. Run it only with the full stack up
(`make up`) and pass --yes.

The console stays read-only (decision D1). This script is the operator acting through the engine and
the Batteries CLI, exactly as deploy/README.md#operating describes. It is safe to re-run: existing
grants, allocations and keys are reused; each run adds a new batch of jobs.

    python3 scripts/demo-traffic.py --yes            # the scenario below
    python3 scripts/demo-traffic.py --yes --jobs 2   # more jobs per actor
    python3 scripts/demo-traffic.py --yes --duration 300 --workers 3   # steady traffic for five minutes

Actor keys are written to .local/demo-keys.json (git-ignored, mode 0600) so later runs reuse them.
"""

import argparse
import json
import os
import itertools
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / "deploy" / ".env"
KEYS_FILE = ROOT / ".local" / "demo-keys.json"

CHAT = "blueclaw/chat/qwen3.8-27b"
EMBED = "blueclaw/embeddings/ollama"

GRANTS = {"Acme Studio": "2", "Northwind Research": "1"}

# (application, actor, grant, allocation USD, jobs: (app, how many per --jobs unit))
ACTORS = [
    ("default", "alice", "Acme Studio", "0.40", [(CHAT, 3)]),
    ("default", "bob", "Acme Studio", "0.25", [(CHAT, 1), (EMBED, 2)]),
    ("default", "carol", "Northwind Research", "0.30", [(EMBED, 2), (CHAT, 1)]),
    ("default", "dave", "Northwind Research", "0.05", [(CHAT, 1)]),
    # A second application, so the Users page shows what an admin key cannot read (gap G9).
    ("studio", "erin", "Acme Studio", "0.20", [(CHAT, 1)]),
]

PROMPTS = [
    "In one sentence, what is a payment ticket in a micropayment system?",
    "Name three uses for text embeddings, comma separated.",
    "Give a haiku about GPUs.",
    "What does an orchestrator do in a video network? One sentence.",
    "Summarise why exact decimal arithmetic matters for billing, in one line.",
]


def env() -> dict[str, str]:
    values = {}
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            name, _, value = line.partition("=")
            values[name.strip()] = value.split("#")[0].strip()
    return values


class Engine:
    def __init__(self, base: str, admin: str) -> None:
        self.base = base.rstrip("/")
        self.admin = admin

    def call(self, method: str, path: str, token: str, body: object | None = None, timeout: float = 120):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(f"{self.base}{path}", data=data, method=method)
        request.add_header("Authorization", f"Bearer {token}")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read()
                return response.status, dict(response.headers), raw
        except urllib.error.HTTPError as error:
            return error.code, dict(error.headers), error.read()

    def admin_json(self, method: str, path: str, body: object | None = None):
        status, _, raw = self.call(method, path, self.admin, body)
        return status, (json.loads(raw) if raw else None)


def ensure_grants(engine: Engine) -> dict[str, str]:
    status, grants = engine.admin_json("GET", "/v1/admin/grants")
    if status != 200:
        sys.exit(f"cannot list grants: HTTP {status} {grants}")
    by_name = {grant["name"]: grant["id"] for grant in grants}
    for name, amount in GRANTS.items():
        if name in by_name:
            continue
        # The engine's grant-desk credential cannot fund a grant (docs/references/gaps.md), so use the CLI.
        out = subprocess.run(
            ["docker", "compose", "-f", str(ROOT / "deploy" / "compose.yaml"), "exec", "-T", "clearinghouse",
             "clearinghouse", "--db-path", "/data/clearinghouse.db", "grant", "create",
             "--name", name, "--sponsor", name, "--amount-usd", amount, "--status", "active"],
            check=True, capture_output=True, text=True,
        ).stdout
        created = json.loads(out)
        by_name[name] = created.get("id") or created["grant"]["id"]
        print(f"grant  {name}: ${amount} ({by_name[name]})")
    return by_name


def ensure_actor(engine: Engine, grants: dict[str, str], keys: dict, app_id: str, actor: str, grant: str, amount: str) -> str:
    path = f"/v1/admin/applications/{app_id}/actors/{actor}/allocation"
    status, body = engine.admin_json("POST", path, {"amount": {"amount": amount, "currency": "USD"}, "label": actor, "grant_id": grants[grant]})
    if status == 201:
        print(f"actor  {app_id}/{actor}: ${amount} from {grant} (allocation {body['allocation_id']})")
    elif status != 409:
        print(f"actor  {app_id}/{actor}: provisioning answered HTTP {status} {body}; continuing if it already exists")
    slot = f"{app_id}/{actor}"
    if slot not in keys:
        status, issued = engine.admin_json("POST", "/v1/admin/keys", {"actor_id": actor, "application_id": app_id, "label": f"demo {actor}"})
        if status != 201:
            sys.exit(f"cannot issue a key for {slot}: HTTP {status} {issued}")
        keys[slot] = issued["token"]
        KEYS_FILE.parent.mkdir(exist_ok=True)
        KEYS_FILE.write_text(json.dumps(keys, indent=2))
        KEYS_FILE.chmod(0o600)
        print(f"key    {slot}: {issued['key']['key_id']}")
    return keys[slot]


def request_for(app: str, index: int) -> dict:
    prompt = PROMPTS[index % len(PROMPTS)]
    if app == EMBED:
        return {"app": app, "path": "/v1/embeddings", "payload": {"model": "nomic-embed-text:latest", "input": prompt}, "max_attempts": 2, "timeout_s": 60}
    return {
        "app": app,
        "path": "/v1/chat/completions",
        "payload": {"messages": [{"role": "user", "content": prompt}], "max_tokens": 48, "temperature": 0.7, "chat_template_kwargs": {"enable_thinking": False}},
        "max_attempts": 3,
        "timeout_s": 120,
    }


def run_job(engine: Engine, token: str, slot: str, request: dict) -> int:
    started = time.monotonic()
    status, headers, raw = engine.call("POST", "/v1/jobs", token, request, timeout=request["timeout_s"] + 30)
    job_id = headers.get("livepeer-job-id") or headers.get("Livepeer-Job-Id")
    took = time.monotonic() - started
    try:
        body = json.loads(raw)
    except ValueError:
        body = {}
    usage = body.get("usage") if isinstance(body, dict) else None
    print(f"job    {slot:<16} {request['app']:<28} HTTP {status} in {took:4.1f}s  job {job_id}")
    if status == 200 and job_id and isinstance(usage, dict):
        quantities = {k: int(v) for k, v in usage.items() if isinstance(v, int) and k.endswith("tokens")}
        if quantities:
            engine.call("POST", f"/v1/jobs/{job_id}/usage", token, {"quantities": quantities})
    return status


def steady(engine: Engine, tokens: dict[str, str], seconds: float, workers: int, pause: float) -> None:
    """Rotate through every actor and its apps for `seconds`, with `workers` jobs in flight at once."""
    plan = [(f"{app_id}/{actor}", app) for app_id, actor, _, _, apps in ACTORS for app, _ in apps]
    turns = itertools.cycle(enumerate(plan))
    lock = threading.Lock()
    deadline = time.monotonic() + seconds
    counts = {"ok": 0, "failed": 0}

    def work() -> None:
        while time.monotonic() < deadline:
            with lock:
                index, (slot, app) = next(turns)
            status = run_job(engine, tokens[slot], slot, request_for(app, index))
            with lock:
                counts["ok" if status == 200 else "failed"] += 1
            time.sleep(pause)

    threads = [threading.Thread(target=work, daemon=True) for _ in range(max(1, workers))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    print(f"steady traffic: {counts['ok']} succeeded, {counts['failed']} failed over {seconds:.0f} s")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--yes", action="store_true", help="confirm: this spends real money through the signer")
    parser.add_argument("--jobs", type=int, default=1, help="multiply each actor's job count (default 1)")
    parser.add_argument("--no-failure", action="store_true", help="skip the one deliberately rejected request")
    parser.add_argument("--duration", type=float, default=0, help="instead of one batch, run steady traffic for this many seconds")
    parser.add_argument("--workers", type=int, default=3, help="jobs in flight at once in --duration mode (default 3)")
    parser.add_argument("--pause", type=float, default=1.0, help="seconds each worker waits between jobs (default 1)")
    args = parser.parse_args()
    if not args.yes:
        sys.exit("This spends real money (paid jobs through the signer). Re-run with --yes.")
    values = env()
    engine = Engine(f"http://127.0.0.1:{values.get('ENGINE_PORT') or '8090'}", values["CONSOLE_ENGINE_ADMIN_TOKEN"])
    keys = json.loads(KEYS_FILE.read_text()) if KEYS_FILE.exists() else {}
    grants = ensure_grants(engine)
    tokens = {f"{app_id}/{actor}": ensure_actor(engine, grants, keys, app_id, actor, grant, amount) for app_id, actor, grant, amount, _ in ACTORS}
    if args.duration > 0:
        steady(engine, tokens, args.duration, args.workers, args.pause)
        print("done. Costs reach the console after the engine's next cost sync (about 30 s).")
        return
    index = 0
    for app_id, actor, _, _, plan in ACTORS:
        token = tokens[f"{app_id}/{actor}"]
        for app, count in plan:
            for _ in range(count * max(1, args.jobs)):
                run_job(engine, token, f"{app_id}/{actor}", request_for(app, index))
                index += 1
    if not args.no_failure:
        # A request the runner rejects: shows how a failed (and possibly paid) attempt is classified.
        bad = {"app": CHAT, "path": "/v1/chat/completions", "payload": {"messages": "not a list"}, "max_attempts": 1, "timeout_s": 60}
        run_job(engine, keys["default/bob"], "default/bob", bad)
    print("done. Costs reach the console after the engine's next cost sync (about 30 s).")


if __name__ == "__main__":
    main()
