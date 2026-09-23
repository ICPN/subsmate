"""Popola la collezione `services` con i servizi LLM di partenza.

Idempotente: lo slug è la chiave, rilanciarlo aggiorna senza duplicare.
Uso:
    python execution/seed_services.py
    python execution/seed_services.py --dry-run
"""

import argparse
from datetime import datetime, timezone

from db import get_db

# Tariffe mensili per persona, in euro. Da allineare ai costi reali della piattaforma.
SERVICES = [
    {"name": "Claude", "slug": "claude", "monthlyRate": 25.0, "billingDayOfMonth": 18},
    {"name": "ChatGPT", "slug": "chatgpt", "monthlyRate": 25.0, "billingDayOfMonth": 18},
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Mostra cosa farebbe senza scrivere")
    args = parser.parse_args()

    db = get_db()
    now = datetime.now(timezone.utc)

    for service in SERVICES:
        if args.dry_run:
            print(f"[dry-run] upsert servizio '{service['name']}' ({service['monthlyRate']} EUR/mese)")
            continue

        result = db.services.update_one(
            {"slug": service["slug"]},
            {
                "$set": {**service, "active": True, "updatedAt": now},
                "$setOnInsert": {"notes": "", "createdAt": now},
            },
            upsert=True,
        )
        action = "creato" if result.upserted_id else "aggiornato"
        print(f"Servizio '{service['name']}' {action}.")

    if not args.dry_run:
        print(f"\nTotale servizi in database: {db.services.count_documents({})}")


if __name__ == "__main__":
    main()
