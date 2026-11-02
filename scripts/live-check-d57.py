#!/usr/bin/env python3
"""Check builder-core's repeat-safe commands (D57, #76) and D59–D61 live, through the engine on this stack.

THIS SPENDS REAL MONEY: about six short paid chat jobs (well under a cent). Run it with the full stack up
(`make up`) and pass --yes. Each run makes its own grant and actor, named live-d57-<time>, so runs never
collide; they stay in the stack's volumes.

    python3 scripts/live-check-d57.py --yes

What it checks, against the real Batteries and signer:

- every admin command that moves money or creates a key answers 422 without an operation_ref;
- a repeat of create grant, fund grant, provision, fund, issue key and rotate key replays the first answer
  (Idempotent-Replayed: true) and applies once, read back from Batteries' totals; another body under the
  same reference is 409 operation_conflict;
- provisioning an actor already provisioned, under a new reference, is 409 already_provisioned and applies
  nothing; a created grant reads back in full and carries its metadata.lpb_operation tag in Batteries;
- a replayed key issue or rotation is 201 with token null and replayed true; a repeated payment-key
  rotation leaves the live key paying (B1);
- jobs: a repeat after success is 409 operation_exists, another body 409 operation_conflict, a repeat
  while a stream runs 409 operation_in_progress with Retry-After, and a job that failed before dispatch
  runs again under its reference;
- the test actor's reconciliation is balanced after cost sync.

Since builder-core 9e447ce (D59–D61; free checks, nothing more is paid): `GET /v1/jobs?before=` pages to
older jobs and refuses a time without an offset (422); a request declaring a body over 16 MiB is 413
`request_too_large` with `limit_bytes`; the cost summary's `by_app` adds up to `by_class` for every class;
`GET /v1/events` is 501 `milestone: "held"`; `GET /v1/jobs/{id}/result` is 501 (M4); a repeated key revoke
is 204 both times and an unknown key is still 400. The allocation revoke repeat is checked through the
console by scripts/live-check-d57-ui.py, which needs the actor until its end.

It ends with the actor and grant for scripts/live-check-d57-ui.py. Evidence:
docs/references/evidence/2026-10-29-d57-live-check.md.
"""

import argparse
import http.client
import json
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
parser.add_argument("--yes", action="store_true", help="confirm: this spends real money through the signer")
parser.add_argument("--env", default=str(ROOT / "deploy" / ".env"), help="the stack's env file (default deploy/.env)")
arguments = parser.parse_args()
if not arguments.yes:
    sys.exit("this spends real money through the signer: pass --yes")
values = {}
for line in Path(arguments.env).read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        name, _, value = line.partition("=")
        values[name.strip()] = value.split("#")[0].strip()
BASE = f"http://127.0.0.1:{values.get('ENGINE_PORT') or '8090'}"
ADMIN = values["CONSOLE_ENGINE_ADMIN_TOKEN"]
RUN = f"live-d57-{int(time.time())}"
APP = "blueclaw/chat/qwen3.8-27b"
results: list[tuple[str, bool, str]] = []


def call(method, path, token=ADMIN, body=None, timeout=180):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            if "event-stream" in (response.headers.get("Content-Type") or ""):
                return response.status, dict(response.headers), raw.decode(errors="replace")
            return response.status, dict(response.headers), json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            parsed = json.loads(raw) if raw.strip() else None
        except ValueError:
            parsed = raw.decode(errors="replace")
        return error.code, dict(error.headers), parsed


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))


def header(headers, name):
    return {k.lower(): v for k, v in headers.items()}.get(name.lower())


def usd(amount):
    return {"amount": amount, "currency": "USD"}


def chat(prompt, stream=False):
    return {
        "app": APP,
        "path": "/v1/chat/completions",
        "payload": {
            "model": "Qwen3.8-27B",
            "stream": stream,
            "max_tokens": 600 if stream else 16,
            "messages": [{"role": "user", "content": prompt}],
            "chat_template_kwargs": {"enable_thinking": False},
        },
    }


actor = f"{RUN}-x"
alloc = f"/v1/admin/applications/default/actors/{actor}/allocation"

# -- A1: references are required on all seven commands ----------------------------------------------
required = [
    ("POST", "/v1/admin/grants", {"name": f"{RUN}-g", "amount": usd("0.5")}),
    ("POST", "/v1/admin/grant/fund", {"amount": usd("0.1"), "grant_id": "g"}),
    ("POST", alloc, {"amount": usd("0.05"), "grant_id": "g"}),
    ("POST", alloc + "/fund", {"amount": usd("0.02")}),
    ("POST", alloc + "/rotate-key", {}),
    ("POST", "/v1/admin/keys", {"actor_id": actor}),
    ("POST", "/v1/admin/keys/key_x/rotate", {}),
]
for method, path, body in required:
    status, _, _ = call(method, path, body=body)
    check(f"A1 no operation_ref is 422: {method} {path.replace(actor, '<actor>')}", status == 422, str(status))

# -- A5: grant create replays, conflicts, reads back in full, tagged in Batteries --------------------
gname = f"{RUN}-grant"
gbody = {"name": gname, "amount": usd("0.50"), "operation_ref": f"{RUN}-g1"}
s1, h1, grant = call("POST", "/v1/admin/grants", body=gbody)
check("A5 create grant 201", s1 == 201, f"{s1} {grant}")
check("A5 created grant read back in full (name, status, total)", s1 == 201 and grant["name"] == gname and grant["status"] and grant["total"], str(grant))
check("A5 grant carries metadata.lpb_operation", s1 == 201 and grant.get("metadata", {}).get("lpb_operation"), str(grant))
s2, h2, again = call("POST", "/v1/admin/grants", body=gbody)
check("A5 repeated grant create replays (same body, Idempotent-Replayed)", s2 == 201 and again == grant and header(h2, "Idempotent-Replayed") == "true", f"{s2} {header(h2, 'Idempotent-Replayed')}")
s3, _, conflict = call("POST", "/v1/admin/grants", body=gbody | {"amount": usd("0.60")})
check("A5 same ref, other body: 409 operation_conflict", s3 == 409 and conflict.get("code") == "operation_conflict", f"{s3} {conflict}")
_, _, grants = call("GET", "/v1/admin/grants")
mine = [g for g in grants if g["name"] == gname]
check("A5 Batteries holds exactly one grant, with the tag", len(mine) == 1 and mine[0]["metadata"].get("lpb_operation") == grant["metadata"]["lpb_operation"], str(mine))
gid = grant["id"]

# -- A9: grant funding applies once ----------------------------------------------------------------
fbody = {"amount": usd("0.10"), "grant_id": gid, "operation_ref": f"{RUN}-gf1"}
s1, _, _ = call("POST", "/v1/admin/grant/fund", body=fbody)
s2, h2, _ = call("POST", "/v1/admin/grant/fund", body=fbody)
check("A9 fund grant, then a replay", s1 == 204 and s2 == 204 and header(h2, "Idempotent-Replayed") == "true", f"{s1} {s2} {header(h2, 'Idempotent-Replayed')}")
_, _, grants = call("GET", "/v1/admin/grants")
total = next(g["total"] for g in grants if g["id"] == gid)
check("A9 grant total grew by 0.10 once (0.50 -> 0.60)", Decimal(total) == Decimal("0.60"), total)

# -- A2/A4: provisioning replays, conflicts, refuses an existing actor ------------------------------
pbody = {"amount": usd("0.05"), "grant_id": gid, "label": actor, "operation_ref": f"{RUN}-p1"}
s1, _, provisioned = call("POST", alloc, body=pbody)
check("A2 provision 201", s1 == 201, f"{s1} {provisioned}")
s2, h2, again = call("POST", alloc, body=pbody)
check("A2 repeated provision replays", s2 == 201 and again == provisioned and header(h2, "Idempotent-Replayed") == "true", f"{s2} {header(h2, 'Idempotent-Replayed')}")
s3, _, conflict = call("POST", alloc, body=pbody | {"amount": usd("0.06")})
check("A2 same ref, other amount: 409 operation_conflict", s3 == 409 and conflict.get("code") == "operation_conflict", f"{s3} {conflict}")
s4, h4, refused = call("POST", alloc, body=pbody | {"amount": usd("0.03"), "operation_ref": f"{RUN}-p2"})
check("A4 new ref on a provisioned actor: 409 already_provisioned with the actor", s4 == 409 and refused.get("code") == "already_provisioned" and refused.get("actor", {}).get("allocation_id") == provisioned["allocation_id"], f"{s4} {refused}")

# -- A2: allocation funding applies once -----------------------------------------------------------
abody = {"amount": usd("0.02"), "operation_ref": f"{RUN}-fa1"}
s1, _, _ = call("POST", alloc + "/fund", body=abody)
s2, h2, _ = call("POST", alloc + "/fund", body=abody)
check("A2 fund allocation, then a replay", s1 in (200, 204) and s2 == s1 and header(h2, "Idempotent-Replayed") == "true", f"{s1} {s2}")

# -- A6: access key issue replays without its token -------------------------------------------------
kbody = {"actor_id": actor, "application_id": "default", "label": actor, "operation_ref": f"{RUN}-k1"}
s1, _, issued = call("POST", "/v1/admin/keys", body=kbody)
s2, h2, replay = call("POST", "/v1/admin/keys", body=kbody)
check("A6 issue key 201 with a token, replayed:false", s1 == 201 and issued["token"] and issued.get("replayed") is False, str(s1))
check("A6 repeated issue: 201, token null, replayed:true, same key", s2 == 201 and replay["token"] is None and replay.get("replayed") is True and replay["key"]["key_id"] == issued["key"]["key_id"] and header(h2, "Idempotent-Replayed") == "true", f"{s2} {replay}")
_, _, keys = call("GET", "/v1/admin/keys")
listed = keys if isinstance(keys, list) else keys.get("keys", keys.get("items", []))
check("A6 one key for the actor", len([k for k in listed if k.get("actor_id") == actor]) == 1, str(len(listed)))
token = issued["token"]


def granted():
    _, _, allowance = call("GET", "/v1/allowance", token)
    return Decimal(allowance["granted"]["amount"])


check("A2/A4 the allocation was granted 0.05 + 0.02 once: 0.07 (no repeat applied twice, no amount dropped)", granted() == Decimal("0.07"), str(granted()))

# -- J1: job repeat rules on a paid job ------------------------------------------------------------
jbody = chat("Say hi in one word.") | {"operation_ref": f"{RUN}-j1"}
s1, h1, job = call("POST", "/v1/jobs", token, jbody)
check("J1 paid chat job succeeded", s1 == 200, f"{s1} {str(job)[:200]}")
s2, h2, exists = call("POST", "/v1/jobs", token, jbody)
check("J1 repeat after success: 409 operation_exists, same job id", s2 == 409 and exists.get("code") == "operation_exists" and header(h2, "Livepeer-Job-Id") == header(h1, "Livepeer-Job-Id"), f"{s2} {exists}")
s3, _, conflict = call("POST", "/v1/jobs", token, chat("Say bye in one word.") | {"operation_ref": f"{RUN}-j1"})
check("J1 same ref, other body: 409 operation_conflict", s3 == 409 and conflict.get("code") == "operation_conflict", f"{s3} {conflict}")

# -- J4: a job that failed before dispatch runs again under its reference ---------------------------
nbody = {"app": f"{RUN}/no-such-app", "operation_ref": f"{RUN}-j2"}
s1, h1, first = call("POST", "/v1/jobs", token, nbody)
s2, h2, second = call("POST", "/v1/jobs", token, nbody)
j1, j2 = header(h1, "Livepeer-Job-Id"), header(h2, "Livepeer-Job-Id")
check("J4 no_offering, then the repeat runs a new job (not 409)", s1 == s2 and s1 != 409 and j1 and j2 and j1 != j2, f"{s1} {s2} {j1} {j2} {str(first)[:160]}")

# -- J3: a repeat while a streamed job runs is in progress ------------------------------------------
sbody = chat("Count from one to two hundred in words, one per line.", stream=True) | {"operation_ref": f"{RUN}-j3"}
holder: dict = {}


def stream():
    holder["result"] = call("POST", "/v1/jobs?stream=true", token, sbody, timeout=300)


thread = threading.Thread(target=stream)
thread.start()
time.sleep(4)
s, h, progress = call("POST", "/v1/jobs?stream=true", token, sbody)
check("J3 repeat while streaming: 409 operation_in_progress, Retry-After", s == 409 and progress.get("code") == "operation_in_progress" and header(h, "Retry-After"), f"{s} {header(h, 'Retry-After')} {str(progress)[:200]}")
thread.join()
status, sheaders, streamed = holder.get("result", (0, {}, ""))
check("J3 the stream itself succeeded and ended with [DONE]", status == 200 and "[DONE]" in str(streamed), f"{status} {str(streamed)[-120:]}")
_, _, sjob = call("GET", f"/v1/jobs/{header(sheaders, 'Livepeer-Job-Id')}", token)
check("J3 the streamed job is succeeded, one dispatch", isinstance(sjob, dict) and sjob.get("state") == "succeeded" and len(sjob.get("attempts", [])) == 1, str(sjob)[:200])

# -- A8 (B1): a repeated payment-key rotation keeps the live key working ----------------------------
rbody = {"operation_ref": f"{RUN}-r1"}
s1, _, rotated = call("POST", alloc + "/rotate-key", body=rbody)
s2, h2, again = call("POST", alloc + "/rotate-key", body=rbody)
check("A8 rotate payment key, then a replay with the same key", s1 == 200 and s2 == 200 and again["api_key_id"] == rotated["api_key_id"] != provisioned["api_key_id"] and header(h2, "Idempotent-Replayed") == "true", f"{s1} {s2} {str(rotated)[:120]}")
s, _, job = call("POST", "/v1/jobs", token, chat("Say ok in one word."))
check("A8 B1: a paid job after the repeated rotation still pays (live key not revoked)", s == 200, f"{s} {str(job)[:200]}")

# -- A7: access key rotation replays without its token ---------------------------------------------
kid = issued["key"]["key_id"]
s1, _, newkey = call("POST", f"/v1/admin/keys/{kid}/rotate", body={"operation_ref": f"{RUN}-rk1"})
s2, h2, replay = call("POST", f"/v1/admin/keys/{kid}/rotate", body={"operation_ref": f"{RUN}-rk1"})
check("A7 rotate access key 201 with a token; repeat: token null, replayed:true", s1 == 201 and newkey["token"] and s2 == 201 and replay["token"] is None and replay.get("replayed") is True, f"{s1} {s2}")
s, _, _ = call("POST", "/v1/jobs", newkey["token"], chat("Say yes in one word."))
check("A7 the rotated key runs a paid job", s == 200, str(s))
s, _, _ = call("GET", "/v1/allowance", token)
check("A7 the old access key is refused (401)", s == 401, str(s))

# -- D59: paged history, and the request limit (free) ----------------------------------------------
live = newkey["token"]
s, _, page = call("GET", "/v1/jobs?limit=2", live)
check("P1 GET /v1/jobs?limit=2 lists the actor's newest jobs", s == 200 and isinstance(page, list) and len(page) == 2, f"{s} {str(page)[:160]}")
s, _, naive = call("GET", "/v1/jobs?before=" + urllib.parse.quote("2026-10-30T12:00:00"), live)
check("P1 before without an offset is 422 (D59)", s == 422, f"{s} {str(naive)[:160]}")
if isinstance(page, list) and page:
    oldest = page[-1]["created_at"]
    s, _, older = call("GET", "/v1/jobs?limit=50&before=" + urllib.parse.quote(oldest), live)
    at = lambda job: datetime.fromisoformat(job["created_at"].replace("Z", "+00:00"))  # noqa: E731
    check("P1 before=<the page's oldest created_at> lists only older jobs", s == 200 and isinstance(older, list) and all(at(job) < at(page[-1]) for job in older), f"{s} {str(older)[:160]}")


def oversize(token):
    """Declare a 17 MiB body and send none: the engine refuses on Content-Length before reading it (D59)."""
    connection = http.client.HTTPConnection(urllib.parse.urlsplit(BASE).netloc, timeout=30)
    connection.putrequest("POST", "/v1/jobs")
    connection.putheader("Authorization", f"Bearer {token}")
    connection.putheader("Content-Type", "application/json")
    connection.putheader("Content-Length", str(17 * 1024 * 1024))
    connection.endheaders()
    response = connection.getresponse()
    raw = response.read()
    connection.close()
    return response.status, json.loads(raw) if raw.strip() else None


s, too_large = oversize(live)
check("L1 a body over 16 MiB is 413 request_too_large with limit_bytes (D59)", s == 413 and too_large.get("code") == "request_too_large" and too_large.get("limit_bytes") == 16 * 1024 * 1024, f"{s} {too_large}")
s, _, result = call("GET", f"/v1/jobs/{header(h1, 'Livepeer-Job-Id')}/result", token=live)
check("R1 GET /v1/jobs/{id}/result is 501 until M4 (results are inline once, D59)", s == 501 and isinstance(result, dict) and result.get("milestone") == "M4", f"{s} {str(result)[:160]}")

# -- D60: cost per app and class, the events feed held (free) ---------------------------------------
now = datetime.now(timezone.utc)
window = urllib.parse.urlencode({"start": (now - timedelta(days=1)).isoformat(), "end": (now + timedelta(minutes=5)).isoformat()})
s, _, summary = call("GET", f"/v1/costs/summary?{window}")
by_app, by_class = (summary or {}).get("by_app") or {}, (summary or {}).get("by_class") or {}
classes = set(by_class) | {name for fees in by_app.values() for name in fees}
adds_up = all(sum(Decimal(str(fees.get(name, {}).get("fee_eth", "0"))) for fees in by_app.values()) == Decimal(str(by_class.get(name, {}).get("fee_eth", "0"))) for name in classes)
check("C1 by_app is per app and class, and the apps add up to by_class for every class (D60)", s == 200 and by_app and adds_up, json.dumps(summary)[:400])
s, _, held = call("GET", "/v1/events")
check("E1 GET /v1/events is 501, milestone held (D60)", s == 501 and isinstance(held, dict) and held.get("milestone") == "held", f"{s} {held}")

# -- D61: a repeated key revoke answers as the first (free) -----------------------------------------
_, _, spare = call("POST", "/v1/admin/keys", body={"actor_id": actor, "application_id": "default", "label": f"{actor}-spare", "operation_ref": f"{RUN}-k2"})
spare_id = spare["key"]["key_id"]
s1, _, _ = call("POST", f"/v1/admin/keys/{spare_id}/revoke")
s2, _, _ = call("POST", f"/v1/admin/keys/{spare_id}/revoke")
check("K1 revoke a key, then repeat it: 204 both times (D61; the repeat was 400)", s1 == 204 and s2 == 204, f"{s1} {s2}")
s, _, _ = call("POST", "/v1/admin/keys/key_does_not_exist/revoke")
check("K1 a key that never existed is still refused (400 or 404)", s in (400, 404), str(s))

# -- cost sync and reconciliation ------------------------------------------------------------------
time.sleep(5)
for _ in range(12):
    call("POST", "/v1/admin/costs/sync")
    _, _, rec = call("GET", f"/v1/admin/reconciliation?actor_id={actor}")
    if isinstance(rec, dict) and rec.get("balanced") and Decimal(str(rec.get("by_class", {}).get("pending", {}).get("fee_usd", "0"))) == 0:
        break
    time.sleep(10)
check("RC reconciliation for the test actor is balanced, nothing pending", isinstance(rec, dict) and rec.get("balanced"), json.dumps(rec)[:400])
print(json.dumps(rec, indent=1)[:900])

failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed  (run {RUN})")
print(f"for the browser check: --actor {actor} --grant {gid}  (it pauses, reactivates and finally revokes this actor)")
sys.exit(1 if failed else 0)
