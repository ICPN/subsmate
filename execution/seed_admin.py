"""Crea o aggiorna un admin di SubsMate.

La password non si passa come argomento: finirebbe nella cronologia della shell.
Lo script la chiede in input nascosto e la conferma.

Uso:
    python execution/seed_admin.py --email "tizio@icpn.it" --name "Nome Cognome"
    python execution/seed_admin.py --email "tizio@icpn.it" --reset-password

Vedi docs/superpowers/specs/2026-09-22-admin-auth-design.md
"""

import argparse
import base64
import getpass
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

import bcrypt

from db import get_db, ROOT

BCRYPT_COST = 12
MIN_PASSWORD_LENGTH = 12
ENV_LOCAL = ROOT / "frontend" / ".env.local"


def ensure_auth_secret() -> None:
    """Genera AUTH_SECRET in frontend/.env.local se assente, senza toccare le altre righe."""
    if ENV_LOCAL.exists():
        content = ENV_LOCAL.read_text(encoding="utf-8")
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("AUTH_SECRET=") and stripped not in ('AUTH_SECRET=""', "AUTH_SECRET="):
                print("AUTH_SECRET gia' presente, lasciata invariata.")
                return
    else:
        content = ""

    value = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    separator = "" if content.endswith("\n") or not content else "\n"
    with ENV_LOCAL.open("a", encoding="utf-8") as handle:
        handle.write(f'{separator}\n# Generata da execution/seed_admin.py\nAUTH_SECRET="{value}"\n')
    print(f"AUTH_SECRET generata e aggiunta a {ENV_LOCAL}")


def ask_password() -> str:
    """Chiede la password due volte, senza mostrarla."""
    while True:
        first = getpass.getpass("Password (non viene mostrata): ")
        if len(first) < MIN_PASSWORD_LENGTH:
            print(f"Troppo corta: servono almeno {MIN_PASSWORD_LENGTH} caratteri.")
            continue
        second = getpass.getpass("Ripeti la password: ")
        if first != second:
            print("Le due password non coincidono. Riprova.")
            continue
        return first


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", help="Obbligatorio per un nuovo admin")
    parser.add_argument("--reset-password", action="store_true", help="Cambia solo la password")
    args = parser.parse_args()

    ensure_auth_secret()

    db = get_db()
    email = args.email.strip().lower()
    now = datetime.now(timezone.utc)
    existing = db.adminusers.find_one({"email": email})

    if not existing and not args.name:
        print(f"Admin '{email}' non esiste: serve --name per crearlo.", file=sys.stderr)
        return 1

    password = ask_password()
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(BCRYPT_COST)).decode()

    update = {
        "passwordHash": password_hash,
        # Invalida ogni sessione aperta: i token emessi prima di questo istante cadono.
        "passwordChangedAt": now,
        "failedLoginAttempts": 0,
        "lockedUntil": None,
        "updatedAt": now,
    }
    if args.name:
        update["name"] = args.name

    db.adminusers.update_one(
        {"email": email},
        {
            "$set": update,
            "$setOnInsert": {
                "email": email,
                "role": "owner" if db.adminusers.count_documents({}) == 0 else "admin",
                "active": True,
                "lastLoginAt": None,
                "createdAt": now,
            },
        },
        upsert=True,
    )

    action = "aggiornato" if existing else "creato"
    print(f"Admin '{email}' {action}.")
    print(f"Admin totali: {db.adminusers.count_documents({})}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
