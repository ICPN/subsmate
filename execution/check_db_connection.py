"""Diagnostica la connessione a MongoDB Atlas distinguendo le cause piu' comuni.

Un ServerSelectionTimeoutError di pymongo non dice quale strato ha ceduto: qui
separiamo DNS, TCP, TLS e autenticazione, cosi' l'errore indica cosa fare.

Uso:
    python execution/check_db_connection.py
"""

import os
import re
import socket
import ssl
import sys
from urllib.parse import urlparse

from db import get_db, ROOT
from dotenv import load_dotenv

load_dotenv(ROOT / "frontend" / ".env.local")
load_dotenv(ROOT / ".env")


def resolve_hosts(uri: str) -> list[str]:
    """Per un URI mongodb+srv risolve il record SRV e restituisce gli host del replica set."""
    parsed = urlparse(uri)
    hostname = parsed.hostname or ""

    if not uri.startswith("mongodb+srv://"):
        return [hostname]

    try:
        import dns.resolver  # dipendenza di pymongo[srv]

        answers = dns.resolver.resolve(f"_mongodb._tcp.{hostname}", "SRV")
        return [str(record.target).rstrip(".") for record in answers]
    except Exception as exc:  # noqa: BLE001 - qualsiasi errore qui e' un fallimento DNS
        print(f"  DNS: risoluzione SRV fallita ({exc})")
        return []


def port_27017_blocked_locally(host: str = "portquiz.net") -> bool:
    """True se la 27017 non esce da questa rete mentre la 80 passa.

    portquiz.net risponde su qualunque porta e non ha whitelist: se resetta la 27017
    ma non la 80, il blocco e' locale e nessuna modifica su Atlas puo' risolverlo.
    """

    def reachable(port: int) -> bool:
        try:
            with socket.create_connection((host, port), timeout=10) as sock:
                sock.sendall(b"GET / HTTP/1.0\r\nHost: portquiz.net\r\n\r\n")
                return bool(sock.recv(64))
        except OSError:
            return False

    # Se anche la 80 fallisce manca la connettivita' generale: non si conclude nulla.
    return reachable(80) and not reachable(27017)


def main() -> int:
    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("MONGODB_URI non definita. Vedi directives/setup_ambiente.md")
        return 1

    # Non stampare mai la password: si mostra solo l'host.
    safe = re.sub(r"://([^:]+):[^@]+@", r"://\1:***@", uri)
    print(f"URI: {safe}\n")

    print("1. DNS")
    hosts = resolve_hosts(uri)
    if not hosts:
        print("   FALLITO - l'URI o la rete non permettono di risolvere il cluster.")
        return 1
    for host in hosts:
        print(f"   OK   {host}")

    print("\n2. TCP (porta 27017)")
    reachable = []
    for host in hosts:
        try:
            with socket.create_connection((host, 27017), timeout=10):
                print(f"   OK   {host}")
                reachable.append(host)
        except OSError as exc:
            print(f"   KO   {host}: {exc}")

    if not reachable:
        print("\n   Nessun nodo raggiungibile: firewall di rete o porta 27017 bloccata in uscita.")
        return 1

    print("\n3. TLS")
    tls_ok = False
    context = ssl.create_default_context()
    for host in reachable:
        try:
            with socket.create_connection((host, 27017), timeout=10) as sock:
                with context.wrap_socket(sock, server_hostname=host):
                    print(f"   OK   {host}")
                    tls_ok = True
        except OSError as exc:
            print(f"   KO   {host}: {exc}")

    if not tls_ok:
        # Due cause producono lo stesso sintomo (TCP ok, TLS resettato senza alert):
        # IP non autorizzato in Atlas, oppure porta 27017 bloccata in uscita dalla rete
        # locale. Si distinguono provando la 27017 verso un host che non ha whitelist.
        print("\n   TCP passa ma l'handshake TLS viene chiuso dal server.")
        print("   Verifico se la porta 27017 esce davvero da questa rete...")

        if port_27017_blocked_locally():
            print(
                "\n   PORTA 27017 BLOCCATA DALLA RETE LOCALE.\n"
                "   Anche un host pubblico senza whitelist viene resettato sulla 27017,\n"
                "   mentre la 80 passa: il blocco e' del firewall di rete, non di Atlas.\n"
                "   Rimedi: farla sbloccare in uscita, usare hotspot mobile o VPN,\n"
                "   oppure sviluppare su un MongoDB locale."
            )
        else:
            print(
                "\n   La porta 27017 esce regolarmente: il rifiuto arriva da Atlas.\n"
                "   Causa piu' probabile: IP pubblico non autorizzato in\n"
                "   Atlas > Security > Network Access. Aggiungilo e ripeti.\n"
                "   IP pubblico: curl https://api.ipify.org"
            )
        return 1

    print("\n4. Autenticazione e lettura")
    try:
        db = get_db()
        collections = db.list_collection_names()
    except Exception as exc:  # noqa: BLE001 - il messaggio di pymongo e' gia' esplicativo
        print(f"   KO   {exc}")
        print("\n   TLS funziona: il problema e' su utente/password o permessi del database.")
        return 1

    print(f"   OK   database '{db.name}', collezioni: {collections or 'nessuna'}")
    for name in ("services", "people", "subscriptions", "payments"):
        print(f"        {name}: {db[name].count_documents({})} documenti")

    print("\nConnessione funzionante.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
