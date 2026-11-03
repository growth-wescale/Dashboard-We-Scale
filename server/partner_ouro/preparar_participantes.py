"""Prepara a lista privada do evento de setembro/outubro a partir dos dois exports."""
import csv
from datetime import datetime
from decimal import Decimal
import json
import os
from pathlib import Path
import sys
from zoneinfo import ZoneInfo


def participantes(stripe, crm):
    nomes = {}
    for r in crm:
        if r['Funil de vendas'] == 'Scale Partner' and r['Etapa'] == 'Venda':
            nomes.setdefault(r['Email'].strip().casefold(), set()).add(r['Contatos'].strip())
    lista = []
    compradores = set()
    for r in stripe:
        if r['Status'] != 'Paid':
            continue
        email = r['Customer Email'].strip().casefold()
        dia = datetime.fromisoformat(r['Created date (UTC)']).replace(tzinfo=ZoneInfo('UTC')).astimezone(ZoneInfo('America/Sao_Paulo')).date()
        if (r['Captured'] != 'true' or r['Currency'] != 'brl' or Decimal(r['Amount Refunded']) != 0
                or not email or email in compradores or not '2026-09-01' <= dia.isoformat() <= '2026-10-31'):
            raise ValueError('Pagamento fora do recorte confirmado.')
        compradores.add(email)
        nomes_unicos = nomes.get(email, set()) - {''}
        lista.append(dict(participante=next(iter(nomes_unicos)) if len(nomes_unicos) == 1 else email,
                          dia=dia.isoformat(), valor=float(Decimal(r['Amount']))))
    if len(lista) != 5:
        raise ValueError('O export não corresponde aos cinco pagamentos confirmados.')
    return sorted(lista, key=lambda r: r['dia'])


if __name__ == '__main__':
    stripe, crm, destino = map(Path, sys.argv[1:])
    with stripe.open(encoding='utf-8-sig', newline='') as pagos, crm.open(encoding='utf-8-sig', newline='') as deals:
        if deals.readline().strip() != 'sep=,':
            deals.seek(0)
        lista = participantes(csv.DictReader(pagos), csv.DictReader(deals))
    with os.fdopen(os.open(destino, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as out:
        json.dump(lista, out, ensure_ascii=False)
