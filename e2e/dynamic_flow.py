"""Browser test of the whole registry flow, against a FRESH database and the scripted agent.

alice publishes a skill version, bob approves it, a new profile revision is pinned to dev, a new chat
picks it up with no restart, then bob revokes the old version and an open chat re-pins.
Setup and run: see "Test everything" in the README.  Environment:
  BASE_URL  (default http://localhost:4173)   TOKENS  (default backend/.registry_tokens.json)
  SHOTS     (default e2e/shots)
"""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
S = os.getenv("SHOTS", str(ROOT / "e2e" / "shots"))
os.makedirs(f"{S}/shots", exist_ok=True)
T = json.load(open(os.getenv("TOKENS", ROOT / "backend" / ".registry_tokens.json")))
BASE = os.getenv("BASE_URL", "http://localhost:4173")
errs = []

def watch(pg):
    pg.on("console", lambda m: errs.append(f"console: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))

def chat_to_path(pg):
    pg.goto(BASE + "/"); pg.wait_for_selector(".welcome")
    pg.fill(".composer-input", "I want to automate a repetitive workflow with AI"); pg.keyboard.press("Enter")
    pg.wait_for_selector(".form", timeout=30000)
    for i in range(7):
        if i: pg.locator(".option").nth(1).click()
        pg.get_by_role("button", name="Review" if i == 6 else "Next").click()
    pg.get_by_role("button", name="Get my route").click()
    pg.wait_for_selector(".pathcard-src", timeout=30000); pg.wait_for_selector(".ask", timeout=30000)
    return pg.locator(".pathcard-src").inner_text(), pg.locator(".env-tag").inner_text()

def admin(b, who, w=1280, h=900):
    pg = b.new_page(viewport={"width": w, "height": h}); watch(pg)
    pg.goto(BASE + "/admin"); pg.fill("input[aria-label='Registry token']", T[who]); pg.get_by_role("button", name="Sign in").click()
    pg.wait_for_selector(".adm-head")
    return pg

def tab(pg, name):
    pg.get_by_role("button", name=name, exact=True).click(); pg.wait_for_timeout(500)

with sync_playwright() as p:
    b = p.chromium.launch()
    A = b.new_page(viewport={"width": 1280, "height": 860}); watch(A)
    print("A before change:", chat_to_path(A))

    alice = admin(b, "alice"); tab(alice, "Skills")
    md = "---\nname: low-code-path\ndescription: Steps for building an AI agent with the low-code workflow canvas. Version 1.1 adds a security review. Use when the user is comfortable with light scripting.\n---\n\n# Low-code path\n\n1. [You] Describe the workflow trigger\n2. [Agent] Sketch the canvas\n3. [You] Security review\n"
    for label, val in (("Id (must equal name in SKILL.md)", "low-code-path"), ("Label", "Low-code"), ("Blurb", "Workflow canvas with light scripting")):
        alice.get_by_label(label, exact=True).fill(val)
    alice.get_by_label("Version", exact=True).fill("1.1.0"); alice.locator("label.field", has_text="Colour").locator("select").select_option("low-code"); alice.locator("textarea").fill(md)
    alice.get_by_role("button", name="Publish draft").click(); alice.wait_for_selector(".notice[data-ok='true']")
    row = alice.locator("tr", has_text="1.1.0")
    assert row.get_by_role("button", name="Approve").count()==0
    print("alice (publisher) sees no Approve button")
    alice.screenshot(path=f"{S}/shots/d1-alice-skills.png")

    bob = admin(b, "bob"); tab(bob, "Skills")
    bob.locator("tr", has_text="1.1.0").get_by_role("button", name="Approve").click(); bob.wait_for_selector(".notice[data-ok='true']")
    print("bob approves:", bob.locator(".notice").inner_text())

    alice.reload(); alice.wait_for_selector(".adm-head"); tab(alice, "Agents")
    alice.locator(".pick-row", has_text="low-code-path").locator("select").select_option(label="1.1.0 · approved")
    alice.get_by_label("Note").fill("Low-code 1.1.0 with a security review step")
    alice.get_by_role("button", name="Save as draft revision").click(); alice.wait_for_selector(".notice[data-ok='true']")

    bob.reload(); bob.wait_for_selector(".adm-head"); tab(bob, "Agents")
    bob.locator("tr", has_text="security review").get_by_role("button", name="Approve").click(); bob.wait_for_selector(".notice[data-ok='true']")
    card = bob.locator(".pin-card", has=bob.locator("h3", has_text="prod"))
    card.locator("select").select_option(label="#1 approved · Initial profile")
    dev = bob.locator(".pin-card", has=bob.locator("h3", has_text="dev"))
    dev.locator("select").select_option(index=1)  # newest first = revision 2
    dev.get_by_role("button", name="Pin").click(); bob.wait_for_selector(".notice[data-ok='true']")
    bob.screenshot(path=f"{S}/shots/d2-bob-agents.png")
    print("dev pin:", dev.inner_text().replace("\n", " "))

    B = b.new_page(viewport={"width": 1280, "height": 860}); watch(B)
    pathB, envB = chat_to_path(B)
    print("B after change:", pathB, "|", envB)
    B.screenshot(path=f"{S}/shots/d3-chat-new-version.png")

    tab(bob, "Skills")
    bob.locator("tr", has_text="1.0.0").filter(has_text="Low-code").get_by_role("button", name="Revoke").click(); bob.wait_for_selector(".notice[data-ok='true']")
    print("revoked:", bob.locator(".notice").inner_text())

    A.get_by_role("button", name="Done").click()
    A.wait_for_selector(".sec:has(.sec-title:text-is('Output')) .file", timeout=40000)
    print("A kept going after its skill was revoked")
    A.wait_for_timeout(800)
    tab(bob, "Activity"); bob.wait_for_timeout(800)
    rows = bob.locator(".adm-panel", has_text="Conversations").locator("tbody tr")
    print("usage rows:", [r.inner_text().replace("\n", " ")[:120] for r in rows.all()])
    bob.screenshot(path=f"{S}/shots/d4-activity.png")
    bob.get_by_role("button", name="Verify chain").click(); bob.wait_for_timeout(500)
    print("audit:", bob.locator(".notice[data-ok='true']").first.inner_text())
    b.close()
print("ERRORS:", errs or "none")
