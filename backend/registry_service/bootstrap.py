"""First-run setup: create one token per role and write them to .registry_tokens.json (mode 600).

Run once per database. Keep this file out of version control; production uses an IdP instead.
"""
import json
import os
from pathlib import Path

from .app import DB_PATH, db
from .db import now
from .security import hash_token, new_token

OUT = Path(os.getenv("REGISTRY_TOKENS", DB_PATH.parent / ".registry_tokens.json"))
PEOPLE = {
    "admin": "admin",
    "alice": "publisher",
    "bob": "approver",
    "agent-guide": "agent",
    "reader": "reader",
}


def main() -> None:
    tokens = {}
    for name, roles in PEOPLE.items():
        if db.one("SELECT 1 FROM tokens WHERE name=?", (name,)):
            continue
        t = new_token()
        db.run("INSERT INTO tokens(name, roles, token_hash, created_at, created_by) VALUES (?,?,?,?,?)", (name, roles, hash_token(t), now(), "bootstrap"))
        tokens[name] = t
    if tokens:
        existing = json.loads(OUT.read_text()) if OUT.exists() else {}
        OUT.write_text(json.dumps(existing | tokens, indent=2))
        OUT.chmod(0o600)
        print(f"created {len(tokens)} tokens in {OUT.name}")
    else:
        print("tokens already exist")


if __name__ == "__main__":
    main()
