#!/usr/bin/env python3
"""Drive the console's Operator actions in a browser against builder-core's repeat-safe commands (D57, #76).

Runs headless Chrome through Playwright, signed in with the stack's admin key. Run it after
scripts/live-check-d57.py, with the actor and grant it prints; it spends nothing (no jobs run):

    uv run --no-project --with playwright python scripts/live-check-d57-ui.py --actor <actor> --grant <grant id>

What it checks: each Operator dialog carries its own console-<action>-<uuid> operation_ref; a grant created
and an allocation funded through the UI apply once (the API replay of the UI's reference answers
Idempotent-Replayed: true); provisioning an actor already provisioned shows "already provisioned ... Fund
its allocation instead" and offers a new reference; a reference used for another request is shown as not
applied; an issued key's token is shown once, and its replay has none. Screenshots go to .local/.
Evidence: docs/references/evidence/2026-10-29-d57-live-check.md.
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from decimal import Decimal
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
parser.add_argument("--actor", required=True, help="a provisioned test actor (scripts/live-check-d57.py prints one)")
parser.add_argument("--grant", required=True, help="a grant id the actor can be provisioned from")
parser.add_argument("--env", default=str(ROOT / "deploy" / ".env"), help="the stack's env file (default deploy/.env)")
arguments = parser.parse_args()
values = {}
for line in Path(arguments.env).read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        name, _, value = line.partition("=")
        values[name.strip()] = value.split("#")[0].strip()
ENGINE = f"http://127.0.0.1:{values.get('ENGINE_PORT') or '8090'}"
CONSOLE = f"http://127.0.0.1:{values.get('CONSOLE_PORT') or '3060'}"
ADMIN = values["CONSOLE_ENGINE_ADMIN_TOKEN"]
ACTOR, GRANT = arguments.actor, arguments.grant
RUN = f"live-d57-ui-{int(time.time())}"
SHOTS = ROOT / ".local"
SHOTS.mkdir(exist_ok=True)
results: list[tuple[str, bool, str]] = []
REF = re.compile(r"^console-([A-Za-z]+)-[0-9a-f-]{36}$")


def api(method, path, body=None, token=ADMIN):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(ENGINE + path, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return response.status, dict(response.headers), json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        return error.code, dict(error.headers), json.loads(raw) if raw.strip() else None


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))


def open_dialog(page, label):
    page.get_by_role("button", name=label, exact=True).first.click()
    dialog = page.locator("dialog[open]")
    dialog.wait_for()
    return dialog


def ref_of(dialog):
    return dialog.locator('input[name="operation_ref"]').first.get_attribute("value")


def review_and_commit(dialog):
    dialog.locator('button[value="review"]').click()
    dialog.locator('button[value="commit"]').wait_for(timeout=30000)
    dialog.locator('button[value="commit"]').click()
    dialog.locator('[aria-current="step"]', has_text="Result").wait_for(timeout=60000)
    return dialog.inner_text()


def close(page):
    page.keyboard.press("Escape")
    page.locator("dialog[open]").wait_for(state="detached", timeout=10000)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page()
    page.goto(f"{CONSOLE}/operator")
    page.locator('form.signin input[name="key"]').fill(ADMIN)
    page.locator('form.signin button[type="submit"]').click()
    page.get_by_role("button", name="Create a grant", exact=True).first.wait_for(timeout=30000)
    check("UI sign in with the admin key shows the Operator actions", True)

    # U1: every dialog mints its own reference, per action
    refs = {}
    for label in ("Create a grant", "Provision an actor", "Issue a key"):
        dialog = open_dialog(page, label)
        refs[label] = ref_of(dialog)
        close(page)
    actions = {label: (REF.match(ref or "") or [None, None])[1] for label, ref in refs.items()}
    check("U1 each dialog carries console-<action>-<uuid>", all(actions.values()) and len(set(refs.values())) == 3, str(refs))

    # U2/U3: a grant created through the UI exists once, tagged; the API replays the UI's own reference
    dialog = open_dialog(page, "Create a grant")
    gref = ref_of(dialog)
    gname = f"{RUN}-grant"
    dialog.locator('input[name="name"]').fill(gname)
    dialog.locator('input[name="amount"]').fill("0.25")
    text = review_and_commit(dialog)
    check("U2 create a grant through the UI: Grant created", "Grant created" in text, text[:300])
    close(page)
    _, _, grants = api("GET", "/v1/admin/grants")
    mine = [g for g in grants if g["name"] == gname]
    check("U2 Batteries holds that grant once, tagged, total 0.25", len(mine) == 1 and mine[0]["metadata"].get("lpb_operation") and Decimal(mine[0]["total"]) == Decimal("0.25"), str(mine))
    status, headers, again = api("POST", "/v1/admin/grants", {"name": gname, "amount": {"amount": "0.25", "currency": "USD"}, "operation_ref": gref})
    replayed = {k.lower(): v for k, v in headers.items()}.get("idempotent-replayed")
    check("U3 the API replays the UI's reference: the UI sent it, and a repeat applies nothing", status == 201 and replayed == "true" and mine and again["id"] == mine[0]["id"], f"{status} {replayed}")

    # U4: fund the test actor's allocation through the UI, applied once
    page.reload()
    row = page.locator("tr").filter(has_text=ACTOR).first
    row.get_by_role("button", name="Fund", exact=True).first.click()
    dialog = page.locator("dialog[open]")
    dialog.wait_for()
    fref = ref_of(dialog)
    dialog.locator('input[name="amount"]').fill("0.01")
    text = review_and_commit(dialog)
    check("U4 fund an allocation through the UI: Allocation funded", "Allocation funded" in text, text[:300])
    close(page)
    status, headers, _ = api("POST", f"/v1/admin/applications/default/actors/{ACTOR}/allocation/fund", {"amount": {"amount": "0.01", "currency": "USD"}, "operation_ref": fref})
    replayed = {k.lower(): v for k, v in headers.items()}.get("idempotent-replayed")
    check("U4 the API replays the UI's funding reference (applied once)", status in (200, 204) and replayed == "true", f"{status} {replayed}")

    # U5: provisioning an existing actor shows already_provisioned and offers a new reference
    dialog = open_dialog(page, "Provision an actor")
    dialog.locator('input[name="actor_id"]').fill(ACTOR)
    dialog.locator('select[name="grant_id"]').select_option(GRANT)
    dialog.locator('input[name="amount"]').fill("0.02")
    text = review_and_commit(dialog)
    check("U5 provisioning an existing actor says it is already provisioned and nothing was applied", "already provisioned" in text and "Fund its allocation instead" in text, text[:400])
    check("U5 the result offers Start over (new reference)", dialog.get_by_role("button", name="Start over (new reference)").count() == 1, text[-300:])
    page.screenshot(path=str(SHOTS / "live-d57-already-provisioned.png"))
    close(page)

    # U6: a conflict on the UI's own reference is worded as such
    dialog = open_dialog(page, "Create a grant")
    cref = ref_of(dialog)
    api("POST", "/v1/admin/grants", {"name": f"{RUN}-other", "amount": {"amount": "0.30", "currency": "USD"}, "operation_ref": cref})
    dialog.locator('input[name="name"]').fill(f"{RUN}-conflict")
    dialog.locator('input[name="amount"]').fill("0.10")
    text = review_and_commit(dialog)
    check("U6 a reference used for a different request: the UI says it was not applied", "already used for a different request" in text and "did not apply" in text, text[:400])
    check("U6 the result offers Start over (new reference)", dialog.get_by_role("button", name="Start over (new reference)").count() == 1)
    page.screenshot(path=str(SHOTS / "live-d57-conflict.png"))
    close(page)
    _, _, grants = api("GET", "/v1/admin/grants")
    check("U6 no grant was created for the conflicting request", not [g for g in grants if g["name"] == f"{RUN}-conflict"])

    # U7: issuing a key shows the token once; the API replay of the UI's reference has no token
    dialog = open_dialog(page, "Issue a key")
    kref = ref_of(dialog)
    dialog.locator('input[name="actor_id"]').fill(ACTOR)
    text = review_and_commit(dialog)
    shown = re.search(r"lpk_[A-Za-z0-9_-]{20,}", dialog.inner_html())
    check("U7 issue a key through the UI: the token is shown once", "Key issued" in text and shown is not None, text[:300])
    close(page)
    status, headers, replay = api("POST", "/v1/admin/keys", {"actor_id": ACTOR, "application_id": "default", "kind": "actor", "operation_ref": kref})
    check("U7 the API replay of the UI's reference: 201, token null, replayed true", status == 201 and replay["token"] is None and replay.get("replayed") is True, f"{status} {replay}")
    browser.close()

failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed  (run {RUN})")
sys.exit(1 if failed else 0)
