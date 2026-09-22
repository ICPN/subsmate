"""Connessione condivisa a MongoDB per gli script di esecuzione.

Legge la configurazione da .env in root (stessa MONGODB_URI usata dall'app),
così script e webapp non possono puntare a database diversi per distrazione.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.database import Database

ROOT = Path(__file__).resolve().parent.parent

# Precedenza a frontend/.env.local: è il file che usa davvero l'app in locale.
load_dotenv(ROOT / "frontend" / ".env.local")
load_dotenv(ROOT / ".env")


def get_db() -> Database:
    """Restituisce il Database MongoDB configurato, fallendo subito se manca la config."""
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise SystemExit(
            "MONGODB_URI non definita. Copia .env.example in .env (o frontend/.env.local) "
            "e valorizzala. Vedi directives/setup_ambiente.md"
        )

    db_name = os.getenv("MONGODB_DB", "subsmate")
    # serverSelectionTimeoutMS basso: meglio un errore chiaro che uno script appeso.
    client = MongoClient(uri, serverSelectionTimeoutMS=10000)
    client.admin.command("ping")  # fallisce subito se le credenziali o la rete non vanno
    return client[db_name]
