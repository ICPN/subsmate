"""Import una tantum dei dati dal Google Sheet "Application AI Team Plan", tab Subs.

Legge un export CSV (.tmp/subs_export.csv di default) e crea/aggiorna persone,
abbonamenti ed eventuali pagamenti storici. Idempotente: la persona e' identificata
dall'email, l'abbonamento dalla coppia persona + servizio.

Uso:
    python execution/import_subs_from_sheet.py --dry-run
    python execution/import_subs_from_sheet.py --csv .tmp/subs_export.csv

Vedi directives/import_google_sheet.md
"""

import argparse
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from db import get_db

ROOT = Path(__file__).resolve().parent.parent
COLUMN_MAP = json.loads((Path(__file__).parent / "column_map.json").read_text(encoding="utf-8"))

DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%y"]


def pick(row: dict, field: str) -> str:
    """Estrae un campo dalla riga provando tutte le intestazioni note per quel campo."""
    for header in COLUMN_MAP.get(field, []):
        for key, value in row.items():
            if key and key.strip().lower() == header.strip().lower():
                return (value or "").strip()
    return ""


def parse_amount(raw: str) -> float:
    """Normalizza importi tipo '25,00 EUR', '25.00', '25' -> 25.0."""
    if not raw:
        return 0.0
    cleaned = re.sub(r"[^\d,.-]", "", raw).replace(",", ".")
    # Se restano piu' separatori (es. 1.234.56) teniamo l'ultimo come decimale.
    if cleaned.count(".") > 1:
        head, _, tail = cleaned.rpartition(".")
        cleaned = head.replace(".", "") + "." + tail
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_date(raw: str):
    """Prova i formati di data piu' comuni nei Sheet italiani e statunitensi."""
    if not raw:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw.strip()[:10], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def normalize(field: str, raw: str, default: str = "") -> str:
    """Traduce i valori testuali del Sheet nei valori attesi dal modello dati."""
    table = COLUMN_MAP["_valori"].get(field, {})
    return table.get(raw.strip().lower(), default)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", default=str(ROOT / ".tmp" / "subs_export.csv"))
    parser.add_argument("--dry-run", action="store_true", help="Non scrive nulla, stampa il report")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise SystemExit(
            f"File non trovato: {csv_path}\n"
            "Esporta il tab 'Subs' del Google Sheet in CSV e salvalo li'. "
            "Vedi directives/import_google_sheet.md"
        )

    db = get_db()
    now = datetime.now(timezone.utc)

    # Mappa slug -> _id dei servizi gia' configurati (seed_services.py).
    services = {s["slug"]: s["_id"] for s in db.services.find({}, {"slug": 1})}
    if not services:
        raise SystemExit("Nessun servizio in database. Esegui prima: python execution/seed_services.py")

    stats = {"persone": 0, "abbonamenti": 0, "pagamenti": 0, "scartate": 0}
    warnings: list[str] = []

    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        for line_no, row in enumerate(csv.DictReader(handle), start=2):
            email = pick(row, "email").lower()
            if not email or "@" not in email:
                stats["scartate"] += 1
                warnings.append(f"riga {line_no}: email mancante o non valida")
                continue

            raw_service = pick(row, "service")
            service_slug = normalize("service", raw_service)
            if service_slug not in services:
                stats["scartate"] += 1
                warnings.append(f"riga {line_no}: servizio '{raw_service}' non riconosciuto")
                continue

            first_name = pick(row, "firstName") or email.split("@")[0]
            last_name = pick(row, "lastName")
            periodicity = normalize("periodicity", pick(row, "periodicity"), "monthly")
            donation = parse_amount(pick(row, "donationSupplement"))
            last_payment = parse_date(pick(row, "lastPaymentDate"))
            amount = parse_amount(pick(row, "amount"))

            if args.dry_run:
                print(
                    f"[dry-run] {email} | {service_slug} | {periodicity} | "
                    f"donazione {donation} | ultimo pagamento {last_payment}"
                )
                stats["persone"] += 1
                stats["abbonamenti"] += 1
                continue

            person_id = db.people.find_one_and_update(
                {"email": email},
                {
                    "$set": {"firstName": first_name, "lastName": last_name, "updatedAt": now},
                    "$setOnInsert": {
                        "email": email,
                        "active": True,
                        "notes": "",
                        "createdAt": now,
                    },
                },
                upsert=True,
                return_document=True,
            )["_id"]
            stats["persone"] += 1

            sub_id = db.subscriptions.find_one_and_update(
                {"person": person_id, "service": services[service_slug]},
                {
                    "$set": {
                        "periodicity": periodicity,
                        "donationSupplement": donation,
                        "onboardingStatus": "attivo" if last_payment else "da_attivare",
                        "lastPaymentDate": last_payment,
                        "notes": pick(row, "notes"),
                        "updatedAt": now,
                    },
                    "$setOnInsert": {
                        "person": person_id,
                        "service": services[service_slug],
                        "startDate": last_payment,
                        "createdAt": now,
                    },
                },
                upsert=True,
                return_document=True,
            )["_id"]
            stats["abbonamenti"] += 1

            # Pagamento storico: inserito solo se quella data non e' gia' presente,
            # cosi' rilanciare l'import non duplica lo storico.
            if last_payment and amount > 0:
                existing = db.payments.find_one({"subscription": sub_id, "paidAt": last_payment})
                if not existing:
                    db.payments.insert_one(
                        {
                            "subscription": sub_id,
                            "person": person_id,
                            "amount": amount,
                            "donationAmount": donation,
                            "paidAt": last_payment,
                            "method": "altro",
                            "periodStart": last_payment,
                            "periodEnd": None,
                            "reference": "",
                            "notes": "Importato dal Google Sheet",
                            "createdAt": now,
                            "updatedAt": now,
                        }
                    )
                    stats["pagamenti"] += 1

    print("\n--- Report import ---")
    for key, value in stats.items():
        print(f"{key}: {value}")
    if warnings:
        print("\nRighe con problemi:")
        for warning in warnings:
            print(f"  - {warning}")
    if args.dry_run:
        print("\n(dry-run: nessuna scrittura effettuata)")


if __name__ == "__main__":
    main()
