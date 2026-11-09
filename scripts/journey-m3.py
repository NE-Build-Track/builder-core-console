#!/usr/bin/env python3
"""The funded M3 journey (ISS-25): the seven outcomes, with the evidence behind each cost.

THIS SPENDS REAL MONEY: one streamed Qwen chat and one FLUX.2 klein image (`text-to-image`, $0.02 an
image as advertised on 9 November 2026), about $0.03 at most. Run it with the full stack up (`make up`) and
pass --yes:

    python3 scripts/journey-m3.py --yes --out <dir>

From another checkout, point --env and --compose at the checkout the stack runs from: the versions are
read from that checkout.

The journey is docs/product-specs/m3-journey.md. Each run makes its own grant and actor (iss25-<time>),
and the operator's allocation (--allocation, $0.05 by default) is what this run can spend: the signer
refuses once it is used up, give or take one job (the allowance is a cap that can overshoot).

What it records, in <dir>/journey-<run>.json, and checks:

- the versions: the engine's reported version, this checkout's commit and the compose pins;
- the payer, before and after: its TicketBroker deposit and reserve and its nonce, read from Arbitrum One
  with the signer's RPC URL (deploy/secrets/rpc-url, never printed), and Batteries' escrow report. The
  nonce must not move: the payer sends no transaction. A ticket that wins is redeemed by the
  orchestrator, so the deposit can drop, rarely, and the record says by how much;
- the operator's funding: the grant and the allocation, with their ids;
- outcomes 1 to 7 as in the spec, for the builder's own key;
- behind each job's cost, the Batteries usage rows for each session its attempts signed: every applied
  row on this run's allocation and session, and the rows adding up to the cost the engine reports;
- the allowance spent equal to the two jobs' costs, and reconciliation balanced for the actor.

Batteries is not published to the host, so its reads run in the console container, with the console's
reader key. The key the builder held is revoked at the end, whatever happened.
"""

import argparse
import base64
import json
import re
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
parser.add_argument("--yes", action="store_true", help="confirm: this spends real money through the signer")
parser.add_argument("--env", default=str(ROOT / "deploy" / ".env"), help="the stack's env file (default deploy/.env)")
parser.add_argument("--compose", default=str(ROOT / "deploy" / "compose.yaml"), help="the stack's compose file")
parser.add_argument("--out", default=".", help="where to write journey-<run>.json")
parser.add_argument("--allocation", default="0.05", help="USD the operator allocates to this run's actor (at most 0.25)")
arguments = parser.parse_args()
if not arguments.yes:
    sys.exit("this spends real money through the signer: pass --yes")
if not Decimal("0") < Decimal(arguments.allocation) <= Decimal("0.25"):
    sys.exit("--allocation must be more than 0 and at most 0.25 USD")

values = {}
for line in Path(arguments.env).read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        name, _, value = line.partition("=")
        values[name.strip()] = value.split("#")[0].strip()
BASE = f"http://127.0.0.1:{values.get('ENGINE_PORT') or '8090'}"
ADMIN = values["CONSOLE_ENGINE_ADMIN_TOKEN"]
PAYER = values["PAYER_ADDRESS"].lower()
RPC = (Path(arguments.env).parent / "secrets" / "rpc-url").read_text().strip()
TICKET_BROKER = "0xa8bB618B1520E284046F3dFc448851A1Ff26e41B"  # Livepeer's TicketBroker on Arbitrum One
GET_SENDER_INFO = "0xe1a589da"  # getSenderInfo(address)
# The image job was comfystream/fal-flux-schnell until ai1.eliteencoder.net moved to runner contract v1
# (seen 9 November 2026): its fal routes are gone, and text-to-image (FLUX.2 klein, openai.images.v1) replaces it.
CHAT, IMAGE, IMAGE_MODEL = "blueclaw/chat/qwen3.8-27b", "text-to-image", "black-forest-labs/FLUX.2-klein-4B"
RUN = f"iss25-{int(time.time())}"
results: list[tuple[str, bool, str]] = []
evidence: dict = {"run": RUN, "started_at": datetime.now(UTC).isoformat(), "apps": [CHAT, IMAGE]}


def check(n, name, ok, detail=""):
    results.append((f"{n}. {name}", bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + f"{n}. {name}" + (f"  [{detail}]" if detail else ""), flush=True)
    return bool(ok)


def call(method, path, token=ADMIN, body=None, timeout=180):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.status, dict(response.headers), json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, dict(error.headers), json.loads(raw) if raw.strip() else None
        except ValueError:
            return error.code, dict(error.headers), raw.decode(errors="replace")


def header(headers, name):
    return {k.lower(): v for k, v in headers.items()}.get(name.lower())


def usd(amount):
    return {"amount": amount, "currency": "USD"}


def dec(value):
    return None if value in (None, "") else Decimal(str(value))


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json", "User-Agent": "journey-m3"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            answer = json.loads(response.read())
    except (urllib.error.URLError, ValueError) as error:  # the URL holds a key: never print it
        raise SystemExit(f"Arbitrum RPC read failed ({type(error).__name__})") from None
    if "error" in answer:
        raise SystemExit(f"Arbitrum RPC error: {answer['error']}")
    return answer["result"]


def payer_on_chain():
    data = GET_SENDER_INFO + PAYER[2:].rjust(64, "0")
    words = rpc("eth_call", [{"to": TICKET_BROKER, "data": data}, "latest"])[2:]
    deposit, withdraw_round, reserve, claimed = (int(words[i : i + 64], 16) for i in range(0, 256, 64))
    eth = Decimal(10) ** 18
    return {
        "block": int(rpc("eth_blockNumber", []), 16),
        "deposit_eth": str(Decimal(deposit) / eth),
        "reserve_eth": str(Decimal(reserve) / eth),
        "withdraw_round": withdraw_round,
        "reserve_claimed_in_round_eth": str(Decimal(claimed) / eth),
        "nonce": int(rpc("eth_getTransactionCount", [PAYER, "latest"]), 16),
    }


BATTERIES_READ = """
const [path] = process.argv.slice(1);
fetch(process.env.CONSOLE_BATTERIES_URL + path, {headers: {"Livepeer-Clearinghouse-Token": process.env.CONSOLE_BATTERIES_TOKEN}})
  .then(async (r) => process.stdout.write(JSON.stringify({status: r.status, body: await r.text()})))
  .catch((e) => process.stdout.write(JSON.stringify({status: 0, body: String(e)})));
"""


def batteries(path):
    """A Batteries read, from inside the stack's network, with the console's reader key."""
    command = ["docker", "compose", "-f", arguments.compose, "--env-file", arguments.env, "exec", "-T", "console", "node", "-e", BATTERIES_READ, path]
    done = subprocess.run(command, capture_output=True, text=True, timeout=60, check=False)
    if done.returncode != 0:
        return 0, done.stderr.strip()[-300:]
    answer = json.loads(done.stdout)
    try:
        return answer["status"], json.loads(answer["body"])
    except ValueError:
        return answer["status"], answer["body"]


def versions():
    _, _, ready = call("GET", "/readyz")
    pins = dict(re.findall(r"github\.com/[\w.-]+/([\w.-]+?)\.git#([0-9a-f]{40})", Path(arguments.compose).read_text()))
    stack = str(Path(arguments.compose).resolve().parent.parent)  # the checkout the stack was built from
    commit = subprocess.run(["git", "-C", stack, "rev-parse", "HEAD"], capture_output=True, text=True, check=False).stdout.strip()
    dirty = subprocess.run(["git", "-C", stack, "status", "--porcelain"], capture_output=True, text=True, check=False).stdout.strip()
    return {"engine_reports": (ready or {}).get("version"), "console_commit": commit, "console_dirty": bool(dirty), "compose_pins": pins}


OUT = Path(arguments.out)
OUT.mkdir(parents=True, exist_ok=True)
key_id = None
try:
    # -- 0. versions, and the payer before anything runs -------------------------------------------
    evidence["versions"] = versions()
    print("versions:", json.dumps(evidence["versions"]), flush=True)
    evidence["payer_before"] = payer_on_chain() | {"address": PAYER}
    status, escrow = batteries("/v1/escrow/report")
    evidence["escrow_before"] = escrow
    check(6, "the payer's TicketBroker deposit and reserve, read from Arbitrum One", Decimal(evidence["payer_before"]["deposit_eth"]) > 0 and Decimal(evidence["payer_before"]["reserve_eth"]) > 0,
          f"deposit {evidence['payer_before']['deposit_eth']} ETH, reserve {evidence['payer_before']['reserve_eth']} ETH, block {evidence['payer_before']['block']}")
    row = next((r for r in escrow if isinstance(r, dict) and r.get("sender", "").lower() == PAYER), {}) if isinstance(escrow, list) else {}
    check(6, "Batteries' escrow report reads the same payer, on the same TicketBroker", status == 200 and row.get("contract_address", "").lower() == TICKET_BROKER.lower(),
          f"deposit {row.get('deposit_balance_eth')} ETH, reserve {row.get('reserve_balance_eth')} ETH, through block {row.get('confirmed_through_block')}")

    # -- 6. the operator funds: a grant, and this run's actor's allocation -------------------------
    actor = f"{RUN}-builder"
    s1, _, grant = call("POST", "/v1/admin/grants", body={"name": f"{RUN}-grant", "amount": usd("0.10"), "operation_ref": f"{RUN}-grant"})
    grant_id = grant.get("id") if s1 == 201 and isinstance(grant, dict) else None
    check(6, "the operator creates a USD grant", grant_id, f"grant {grant_id or grant}")
    if not grant_id:
        raise SystemExit("no grant: stopping before any paid job")
    alloc = f"/v1/admin/applications/default/actors/{actor}/allocation"
    s2, _, provisioned = call("POST", alloc, body={"amount": usd(arguments.allocation), "grant_id": grant_id, "label": actor, "operation_ref": f"{RUN}-provision"})
    allocation_id = provisioned.get("allocation_id") if isinstance(provisioned, dict) else None
    check(6, f"the operator allocates ${arguments.allocation} of it to the builder's actor", s2 == 201 and allocation_id, f"allocation {allocation_id or provisioned}")
    if not allocation_id:
        raise SystemExit("no allocation: stopping before any paid job")
    evidence["funding"] = {"grant": grant, "actor": actor, "allocation": provisioned}

    # -- 1. one credential ---------------------------------------------------------------------------
    s, _, issued = call("POST", "/v1/admin/keys", body={"actor_id": actor, "application_id": "default", "label": actor, "operation_ref": f"{RUN}-key"})
    key_id = (issued.get("key") or {}).get("key_id") if isinstance(issued, dict) else None
    builder = issued.get("token") if isinstance(issued, dict) else None
    s_jobs, _, _ = call("GET", "/v1/jobs?limit=1", token=builder)
    check(1, "the operator issues an actor key; the builder's key is accepted", s == 201 and s_jobs == 200, f"key {key_id}")
    evidence["key_id"] = key_id

    # -- 2, 3. discover, and read the expected rate ----------------------------------------------------
    _, _, offerings = call("GET", "/v1/offerings", token=builder)
    by_app = {o["app"]: o for o in offerings or []}
    for app in (CHAT, IMAGE):
        o = by_app.get(app)
        check(2, f"{app} is offered, ready and fresh", o is not None and o["ready_count"] > 0 and o["rate_status"] == "available" and not o["stale"],
              json.dumps({k: o[k] for k in ("runner_count", "ready_count", "rate_status", "stale", "observed_at")}) if o else "missing")
        if o:
            rate = o["rate_low"] or {}
            age = (datetime.now(UTC) - datetime.fromisoformat(rate["observed_at"])).total_seconds() if rate.get("observed_at") else None
            check(3, f"{app} rate with currency, unit, source and age", all(rate.get(k) for k in ("amount", "currency", "unit", "source", "observed_by")),
                  f"{rate.get('amount')} {rate.get('currency')}/{rate.get('unit')}, source {rate.get('source')}, age {age:.0f}s" if age is not None else json.dumps(rate))
            evidence[f"offering:{app}"] = o
    _, _, allowance_before = call("GET", "/v1/allowance", token=builder)
    evidence["allowance_before"] = allowance_before

    # -- 4, 5. invoke: the streamed chat, then the image -----------------------------------------------
    chat_body = {"app": CHAT, "path": "/v1/chat/completions", "method": "POST", "operation_ref": f"{RUN}-chat", "timeout_s": 120, "max_attempts": 2,
                 "payload": {"messages": [{"role": "user", "content": "In two sentences, what is the Livepeer network?"}], "max_tokens": 200, "stream": True,
                             "stream_options": {"include_usage": True}, "chat_template_kwargs": {"enable_thinking": False}}}
    request = urllib.request.Request(BASE + "/v1/jobs?stream=true", data=json.dumps(chat_body).encode(), method="POST",
                                     headers={"Authorization": f"Bearer {builder}", "Content-Type": "application/json"})
    text, done, usage, events = [], False, None, 0
    with urllib.request.urlopen(request, timeout=180) as response:
        chat_id, chat_status = header(dict(response.headers), "livepeer-job-id"), response.status
        for raw in response:
            line = raw.decode(errors="replace").strip()
            if not line.startswith("data:"):
                continue
            data, events = line[5:].strip(), events + 1
            if data == "[DONE]":
                done = True
                continue
            try:
                chunk = json.loads(data)
            except ValueError:
                continue
            usage = chunk.get("usage") or usage
            text += [(choice.get("delta") or {}).get("content") or "" for choice in chunk.get("choices") or []]
    reply = "".join(text).strip()
    check(4, "chat streamed through POST /v1/jobs?stream=true", chat_status == 200 and chat_id and events > 1, f"job {chat_id}, {events} events")
    check(5, "chat result: text, [DONE], token usage", reply and done and usage, f"{reply[:90]!r} usage={usage}")
    evidence["chat_reply"], evidence["chat_usage"] = reply, usage

    image_body = {"app": IMAGE, "path": "/v1/images/generations", "method": "POST", "operation_ref": f"{RUN}-image", "timeout_s": 180, "max_attempts": 2,
                  "payload": {"model": IMAGE_MODEL, "prompt": "A lighthouse on a cliff at dusk, watercolour", "n": 1, "size": "1024x768", "response_format": "b64_json"}}
    s_img, h_img, image = call("POST", "/v1/jobs", token=builder, body=image_body)
    image_id = header(h_img, "livepeer-job-id")
    first = ((image.get("data") or [{}])[0]) if isinstance(image, dict) else {}
    try:
        picture = base64.b64decode(first.get("b64_json") or "", validate=True)
    except ValueError:
        picture = b""
    png = picture[:8] == b"\x89PNG\r\n\x1a\n"
    width, height = (struct.unpack(">II", picture[16:24]) if png else (None, None))
    if picture:
        (OUT / f"journey-{RUN}-image.{'png' if png else 'bin'}").write_bytes(picture)
    check(4, "image job through POST /v1/jobs", s_img == 200 and image_id, f"job {image_id}")
    check(5, "image result inline: a PNG, in data[0].b64_json, at the size asked for", png and (width, height) == (1024, 768),
          f"{len(picture)} bytes, {'PNG' if png else 'not a PNG: ' + json.dumps(image)[:200]}, {width}x{height}")
    evidence["image_bytes"], evidence["image_size"] = len(picture), [width, height]
    jobs = {"chat": chat_id, "image": image_id}
    evidence["jobs"] = jobs

    records = {}
    for name, job in jobs.items():
        _, _, record = call("GET", f"/v1/jobs/{job}", token=builder)
        records[name] = record
        attempts = record.get("attempts") or []
        paid = [a for a in attempts if a.get("payment_sent")]
        check(5, f"{name} record: succeeded, paid, with a result reference", record.get("state") == "succeeded" and paid and record.get("result"),
              f"state {record.get('state')}, attempts {len(attempts)}, orchestrator {paid[-1].get('orchestrator_url') if paid else None}")
        check(6, f"{name}: paid from the operator's allocation, not by the builder", paid and all(a.get("allocation_id") == allocation_id for a in paid),
              f"allocation {[a.get('allocation_id') for a in paid]}")

    # -- 7. usage and the resulting charge, and the Batteries rows behind each cost ---------------------
    costs, deadline = {}, time.time() + 300
    while time.time() < deadline:
        call("POST", "/v1/admin/costs/sync")
        costs = {name: call("GET", f"/v1/jobs/{job}/cost", token=builder)[2] for name, job in jobs.items()}
        if all(cost.get("status") in ("observed", "corrected") for cost in costs.values()):
            break
        time.sleep(10)
    evidence["costs"] = costs
    for name, job in jobs.items():
        _, _, record = call("GET", f"/v1/jobs/{job}", token=builder)  # sync matched the sessions since
        records[name] = record
        cost = costs[name]
        fees = cost.get("fees") or {}
        check(7, f"{name} cost observed, in USD", cost.get("status") in ("observed", "corrected") and fees.get("fee_usd") is not None,
              f"status {cost.get('status')}, ${fees.get('fee_usd')} ({fees.get('fee_eth')} ETH), {fees.get('row_count')} row(s), class {[a.get('cost_class') for a in cost.get('attempts') or []]}")
        sessions = [s for a in record.get("attempts") or [] for s in a.get("sessions") or []]
        rows = []
        for session in sessions:
            _, page = batteries(f"/v1/usage?manifest_id={session['manifest_id']}&limit=100")
            items = page.get("items", []) if isinstance(page, dict) else []
            rows += [{"session": session} | {"row": item} for item in items]
        applied = [r["row"] for r in rows if r["row"].get("status") == "applied"]
        on_run = all(r.get("allocation_id") == allocation_id for r in applied)
        same_session = all(r["row"].get("payment_session_id") == r["session"].get("payment_session_id") for r in rows if r["row"].get("status") == "applied")
        check(7, f"{name}: every session matched, every applied Batteries row on this run's allocation and session",
              sessions and all(s.get("match") == "matched" for s in sessions) and applied and on_run and same_session,
              f"{len(sessions)} session(s) {[s.get('match') for s in sessions]}, {len(applied)} applied row(s) {[r.get('id') for r in applied]}")
        usd_sum = sum((dec(r.get("computed_fee_usd")) or Decimal(0) for r in applied), Decimal(0))
        eth_sum = sum((dec(r.get("computed_fee_eth")) or Decimal(0) for r in applied), Decimal(0))
        check(7, f"{name}: the Batteries rows add up to the engine's cost", len(applied) == fees.get("row_count") and usd_sum == dec(fees.get("fee_usd")) and eth_sum == dec(fees.get("fee_eth")),
              f"rows ${usd_sum} / {eth_sum} ETH, engine ${fees.get('fee_usd')} / {fees.get('fee_eth')} ETH")
        evidence[f"record:{name}"] = record
        evidence[f"batteries_rows:{name}"] = rows

    _, _, summary = call("GET", "/v1/costs/summary", token=builder)
    evidence["cost_summary"] = summary
    check(7, "the cost summary names both apps", all(app in (summary or {}).get("by_app", {}) for app in (CHAT, IMAGE)),
          json.dumps({app: list(classes) for app, classes in (summary or {}).get("by_app", {}).items()}))
    _, _, allowance_after = call("GET", "/v1/allowance", token=builder)
    evidence["allowance_after"] = allowance_after
    spent = dec(((allowance_after or {}).get("spent") or {}).get("amount"))
    total = sum((dec((c.get("fees") or {}).get("fee_usd")) or Decimal(0) for c in costs.values()), Decimal(0))
    check(7, "the allowance spent is the two jobs' costs, against what the operator granted", spent == total,
          f"spent ${spent} of ${((allowance_after or {}).get('granted') or {}).get('amount')}, jobs ${total}")
    for _ in range(6):
        _, _, reconciliation = call("GET", f"/v1/admin/reconciliation?actor_id={actor}")
        if isinstance(reconciliation, dict) and reconciliation.get("balanced"):
            break
        call("POST", "/v1/admin/costs/sync")
        time.sleep(10)
    evidence["reconciliation"] = reconciliation
    check(7, "reconciliation for the actor is balanced", isinstance(reconciliation, dict) and reconciliation.get("balanced"), json.dumps(reconciliation)[:200])

    # -- the payer after: no transaction; a winning ticket would show as a lower deposit -------------
    evidence["payer_after"] = payer_on_chain() | {"address": PAYER}
    evidence["escrow_after"] = batteries("/v1/escrow/report")[1]
    before, after = evidence["payer_before"], evidence["payer_after"]
    drop = Decimal(before["deposit_eth"]) - Decimal(after["deposit_eth"])
    check(6, "the payer sent no transaction (nonce unchanged)", before["nonce"] == after["nonce"], f"nonce {before['nonce']} -> {after['nonce']}, blocks {before['block']}-{after['block']}")
    print(f"     deposit {before['deposit_eth']} -> {after['deposit_eth']} ETH ({'no ticket redeemed' if drop == 0 else f'down {drop} ETH: a winning ticket was redeemed'}), "
          f"reserve {before['reserve_eth']} -> {after['reserve_eth']} ETH", flush=True)
finally:
    if key_id:
        s, _, _ = call("POST", f"/v1/admin/keys/{key_id}/revoke")
        check(8, "the builder's key is revoked at the end", s == 204, str(s))
    evidence["finished_at"] = datetime.now(UTC).isoformat()
    evidence["checks"] = [{"check": n, "ok": ok, "detail": d} for n, ok, d in results]
    (OUT / f"journey-{RUN}.json").write_text(json.dumps(evidence, indent=2, default=str))

failed = [n for n, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed  (run {RUN}; evidence {OUT / f'journey-{RUN}.json'})")
sys.exit(1 if failed else 0)
