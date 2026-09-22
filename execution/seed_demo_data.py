"""Popola il database con dati DI PROVA per verificare l'interfaccia.

Crea persone, abbonamenti e pagamenti che coprono tutti e quattro gli stati calcolati
(in regola, in scadenza, in ritardo, da attivare), cosi' la UI si puo' controllare senza
aspettare dati reali.

NON eseguire su un database di produzione: le persone create hanno email @example.test
e lo script le riconosce per poterle rimuovere con --reset.

Uso:
    python execution/seed_demo_data.py
    python execution/seed_demo_data.py --reset   # rimuove i soli dati demo e ricrea
"""

import argparse
from datetime import datetime, timedelta, timezone

from db import get_db

# Dominio riservato ai dati di prova: e' la chiave per distinguerli dai dati veri.
DEMO_DOMAIN = "@example.test"

# giorni_da_ultimo_pagamento e' relativo a oggi, cosi' gli stati restano coerenti
# qualunque sia la data di esecuzione.
DEMO = [
    {
        "first": "Giulia", "last": "Rossi", "service": "chatgpt",
        "periodicity": "monthly", "donation": 5.0,
        "days_since_payment": 38,   # oltre un mese fa -> in ritardo
        "history": 3,
    },
    {
        "first": "Marco", "last": "Bianchi", "service": "claude",
        "periodicity": "monthly", "donation": 0.0,
        "days_since_payment": 50,   # -> in ritardo
        "history": 2,
    },
    {
        "first": "Yintong", "last": "Zhou", "service": "claude",
        "periodicity": "quarterly", "donation": 0.0,
        "days_since_payment": 80,   # ciclo di 3 mesi -> scade fra ~10 giorni
        "history": 2,
    },
    {
        "first": "Anna", "last": "Verdi", "service": "claude",
        "periodicity": "monthly", "donation": 10.0,
        "days_since_payment": 4,    # -> in regola
        "history": 4,
    },
    {
        "first": "Sara", "last": "Conti", "service": "chatgpt",
        "periodicity": "quarterly", "donation": 0.0,
        "days_since_payment": 12,   # -> in regola
        "history": 1,
    },
    {
        "first": "Luca", "last": "Neri", "service": "chatgpt",
        "periodicity": "monthly", "donation": 0.0,
        "days_since_payment": None,  # mai pagato -> da attivare
        "history": 0,
    },
]

PERIOD_MONTHS = {"monthly": 1, "quarterly": 3}


def add_months(date: datetime, months: int) -> datetime:
    """Somma mesi gestendo i mesi corti, come addMonths in lib/billing.ts."""
    year = date.year + (date.month - 1 + months) // 12
    month = (date.month - 1 + months) % 12 + 1
    day = min(date.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
                         else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return date.replace(year=year, month=month, day=day)


def reset_demo(db) -> None:
    """Rimuove solo i dati demo, riconosciuti dal dominio email riservato."""
    people = list(db.people.find({"email": {"$regex": f"{DEMO_DOMAIN}$"}}, {"_id": 1}))
    ids = [p["_id"] for p in people]
    if not ids:
        print("Nessun dato demo da rimuovere.")
        return

    subs = list(db.subscriptions.find({"person": {"$in": ids}}, {"_id": 1}))
    sub_ids = [s["_id"] for s in subs]

    payments = db.payments.delete_many({"subscription": {"$in": sub_ids}}).deleted_count
    subscriptions = db.subscriptions.delete_many({"person": {"$in": ids}}).deleted_count
    persons = db.people.delete_many({"_id": {"$in": ids}}).deleted_count
    print(f"Rimossi: {persons} persone, {subscriptions} abbonamenti, {payments} pagamenti.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="Rimuove i dati demo e li ricrea")
    args = parser.parse_args()

    db = get_db()
    now = datetime.now(timezone.utc)

    services = {s["slug"]: s for s in db.services.find()}
    if not services:
        raise SystemExit("Nessun servizio. Esegui prima: python execution/seed_services.py")

    if args.reset:
        reset_demo(db)

    created = 0
    for entry in DEMO:
        service = services.get(entry["service"])
        if not service:
            print(f"Servizio '{entry['service']}' assente, riga saltata.")
            continue

        email = f"{entry['first'].lower()}.{entry['last'].lower()}{DEMO_DOMAIN}"
        months = PERIOD_MONTHS[entry["periodicity"]]
        quota = service["monthlyRate"] * months
        total = quota + entry["donation"]

        person_id = db.people.find_one_and_update(
            {"email": email},
            {
                "$set": {"firstName": entry["first"], "lastName": entry["last"], "updatedAt": now},
                "$setOnInsert": {"email": email, "active": True, "notes": "", "createdAt": now},
            },
            upsert=True,
            return_document=True,
        )["_id"]

        last_payment = (
            now - timedelta(days=entry["days_since_payment"])
            if entry["days_since_payment"] is not None
            else None
        )

        sub_id = db.subscriptions.find_one_and_update(
            {"person": person_id, "service": service["_id"]},
            {
                "$set": {
                    "periodicity": entry["periodicity"],
                    "donationSupplement": entry["donation"],
                    "onboardingStatus": "attivo" if last_payment else "da_attivare",
                    "lastPaymentDate": last_payment,
                    "notes": "Dato di prova",
                    "updatedAt": now,
                },
                "$setOnInsert": {
                    "person": person_id,
                    "service": service["_id"],
                    "startDate": last_payment,
                    "createdAt": now,
                },
            },
            upsert=True,
            return_document=True,
        )["_id"]

        # Storico: pagamenti a ritroso, uno per ciclo, a partire dall'ultimo.
        db.payments.delete_many({"subscription": sub_id})
        for index in range(entry["history"]):
            paid_at = add_months(last_payment, -index * months)
            db.payments.insert_one(
                {
                    "subscription": sub_id,
                    "person": person_id,
                    "amount": total,
                    "donationAmount": entry["donation"],
                    "paidAt": paid_at,
                    "method": "bonifico" if index % 2 == 0 else "satispay",
                    "periodStart": paid_at,
                    "periodEnd": add_months(paid_at, months),
                    "reference": f"DEMO-{index + 1:03d}",
                    "notes": "Dato di prova",
                    "createdAt": now,
                    "updatedAt": now,
                }
            )

        created += 1
        print(f"{entry['first']} {entry['last']} - {service['name']} ({entry['periodicity']})")

    print(f"\n{created} abbonamenti demo pronti.")
    print(f"persone: {db.people.count_documents({})} | "
          f"abbonamenti: {db.subscriptions.count_documents({})} | "
          f"pagamenti: {db.payments.count_documents({})}")


if __name__ == "__main__":
    main()
