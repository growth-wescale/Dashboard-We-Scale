"""Fotografia privada de métricas agregadas. SELECT somente em views da ouro."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
DEFAULT_SNAPSHOT = HERE.parents[1] / 'outputs/audits/nutricao-previa-20261118.local/resumo.json'
FIELDS = ('processed', 'delivered', 'unique_opens', 'unique_clicks', 'soft_bounces', 'hard_bounces', 'dropped', 'unsubscribed', 'spam_reports')


def sql(catalog):
    ids = ','.join("'" + r['id'].replace("'", "''") + "'" for r in catalog['fluxos'])
    models = ','.join("'" + m.replace("'", "''") + "'" for r in catalog['fluxos'] for m in r['modelos'] if m)
    # Um único statement mantém cobertura e medidas na mesma fotografia.
    return f"""SELECT json_build_object(
      'cobertura', (SELECT json_agg(x) FROM (
        SELECT period_start::text AS dia, period_end::text AS fim, last_observed_at, published_at
        FROM ouro.rdm_email_cobertura WHERE source='workflow_emails' AND period_grain='day'
          AND credential_account_id='1056777' AND source_account_id='175571351342144930'
        ORDER BY period_start) x),
      'modelos', (SELECT json_agg(email_id) FROM ouro.rdm_email_catalogo
        WHERE credential_account_id='1056777' AND source_account_id='1056777' AND email_id IN ({models})),
      'medicoes', (SELECT json_agg(x) FROM (
        SELECT workflow_id AS fluxo, workflow_action_id AS acao, email_name AS email,
          period_start::text AS dia, period_end::text AS fim, {','.join(FIELDS)}, collected_at
        FROM ouro.rdm_email_automacoes_diario
        WHERE credential_account_id='1056777' AND source_account_id='175571351342144930'
          AND workflow_id IN ({ids}) ORDER BY period_start,workflow_id,workflow_action_id) x)
    ) AS dados"""


def normalize(raw, catalog):
    coverage = raw.get('cobertura') or []
    if not coverage or any(r['dia'] != r['fim'] for r in coverage):
        raise ValueError('Cobertura diária inválida')
    days = sorted(r['dia'] for r in coverage)
    if len(days) != len(set(days)):
        raise ValueError('Cobertura repetida')
    known = {f['id'] for f in catalog['fluxos']}
    seen = set()
    measures = raw.get('medicoes') or []
    for r in measures:
        key = (r['fluxo'], r['acao'], r['dia'])
        if r['fluxo'] not in known or not r['acao'] or r['dia'] != r['fim'] or r['dia'] not in days or key in seen:
            raise ValueError('Medição fora do contrato ou repetida')
        seen.add(key)
        for field in FIELDS:
            if r[field] is not None and (type(r[field]) is not int or r[field] < 0):
                raise ValueError('Métrica inválida')
    expected = {m for f in catalog['fluxos'] for m in f['modelos'] if m}
    if not expected.issubset(set(raw.get('modelos') or [])):
        raise ValueError('Catálogo de e-mails incompleto na ouro')
    return {'versao': 1, 'inicio': days[0], 'fim': days[-1], 'dias': days,
            'coletado': max(r['last_observed_at'] for r in coverage),
            'gerado': datetime.now(timezone.utc).isoformat(), 'inventarioEm': catalog['verificado'],
            'fluxos': catalog['fluxos'], 'medicoes': measures}


def fetch_snapshot(key, catalog):
    req = Request('https://metabase.wescale.com.br/api/dataset',
                  data=json.dumps({'database': 3, 'type': 'native', 'native': {'query': sql(catalog)}, 'parameters': []}).encode(),
                  headers={'Content-Type': 'application/json', 'X-API-Key': key})
    with urlopen(req, timeout=55) as res:
        result = json.load(res)
    if result.get('status') != 'completed' or result['data'].get('rows_truncated'):
        raise ValueError('Consulta da ouro incompleta')
    rows = result['data']['rows']
    if len(rows) != 1:
        raise ValueError('Contrato inválido')
    raw = rows[0][0]
    return normalize(json.loads(raw) if isinstance(raw, str) else raw, catalog)


def prepare(destination=DEFAULT_SNAPSHOT):
    catalog = json.loads((HERE / 'catalogo.json').read_text())
    key = Path(os.getenv('WESCALE_METABASE_KEY_FILE', Path.home()/'.config/wescale/metabase/api-key.txt')).read_text().strip()
    snapshot = fetch_snapshot(key, catalog)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix('.tmp')
    with open(temp, 'w', opener=lambda p, flags: os.open(p, flags, 0o600)) as f:
        json.dump(snapshot, f, ensure_ascii=False)
    temp.replace(destination)
    print(json.dumps({'fluxos': len(snapshot['fluxos']), 'medicoes': len(snapshot['medicoes']), 'ate': snapshot['fim']}))


if __name__ == '__main__':
    prepare()
