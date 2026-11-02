"""Gateway isolado Marketing Eletrovias; SQL fixo, ouro exclusiva e sem escrita."""
from __future__ import annotations

import datetime as dt
import decimal
import json
import os
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

CONTRACT = 'eletrovias_marketing_v1'
QUERIES = {
 'leads': 'SELECT * FROM ouro.vw_eletrovias_dashboard_leads ORDER BY dia DESC,id LIMIT 50001',
 'media': 'SELECT * FROM ouro.vw_eletrovias_dashboard_midia ORDER BY dia DESC,id LIMIT 50001',
}
# Explicit test records investigated on 02/11; never use elegivel_kpi as MQL qualification.
KNOWN_TEST_DEALS = {'6adbb24ffe6c3900293048dc', '6adbbe360085d5002083f991', '6ae35e54aefc9100238e22e7'}
DEALS_QUERY = 'SELECT * FROM ouro.vw_eletrovias_dashboard_negocios ORDER BY data_criacao_original DESC,negocio_id LIMIT 50001'


def prepare_deals(rows):
 if len(rows) > 50000: raise GatewayError(503, 'result_too_large')
 zone = ZoneInfo('America/Sao_Paulo')
 seen, result = set(), []
 for row in rows:
  account, deal = row.get('conta_id'), row.get('negocio_id')
  if account != 'wescale_principal_crm' or row.get('marca') != 'Eletrovias' or not isinstance(deal,str) or not deal:
   raise GatewayError(503,'deal_scope_violation')
  key = (account,deal)
  if key in seen: raise GatewayError(503,'duplicate_deal')
  seen.add(key)
  created = row.get('data_criacao_original')
  if isinstance(created,str):
   try:
    try: created = dt.datetime.fromisoformat(created.replace('Z','+00:00'))
    except ValueError: created = dt.datetime.strptime(created,'%Y-%m-%dT%H:%M:%S.%f%z')
   except ValueError: raise GatewayError(503,'invalid_creation_date') from None
  if not isinstance(created,dt.datetime) or created.tzinfo is None: raise GatewayError(503,'invalid_creation_date')
  day = created.astimezone(zone).date().isoformat()
  if not '2026-10-01' <= day < '2026-11-01': continue
  if deal in KNOWN_TEST_DEALS: continue
  result.append({
   'id':f'eletrovias-deal:{account}:{deal}', 'dia':day,'marca':'Eletrovias',
   **{field:None for field in ('nome','email','telefone','uf','cidade','formulario','row_hash')},
   **{field:row.get(field) for field in ('utm_source','utm_medium','utm_campaign')},
   'criado_em':created.isoformat(),'carregado_em':row.get('carregado_em'),
   'dados_extras':{'metric_grain':'crm_deal','conta_id':account,'id_deal':deal,
    'crm_funil_id':row.get('funil_id'),'crm_funil':row.get('nome_funil'),
    'crm_status':row.get('status_atual'),'data_criacao_crm':created.isoformat(),
    'utm_content':row.get('utm_content'),'utm_term':row.get('utm_term')},
  })
 return result, []
ROUTES = {'/':'aba.visao-geral','/marca':'aba.saude-marca','/sop-marketing':'aba.sop-marketing','/okrs':'aba.okrs','/copa-b2b':'aba.okrs'}


class GatewayError(Exception):
 def __init__(self, status, code): self.status, self.code = status, code


def authorize(token, request_json, route):
 if not token or len(token) > 8192: raise GatewayError(401, 'session_required')
 user = request_json('/auth/v1/user', token, None)
 if not isinstance(user, dict) or not user.get('id') or user.get('is_anonymous') is True:
  raise GatewayError(401, 'invalid_session')
 access = request_json('/rest/v1/rpc/minhas_permissoes', token, {})
 if not isinstance(access, dict) or access.get('registrado') is not True or access.get('ativo') is not True:
  raise GatewayError(403, 'inactive_user')
 if access.get('acesso_total') is True: return
 permissions = access.get('permissoes')
 brands = access.get('marcas') or ([access['marca']] if access.get('marca') else [])
 if not isinstance(permissions, list) or ROUTES[route] not in permissions:
  raise GatewayError(403, 'tab_not_allowed')
 if not isinstance(brands, list) or any(not isinstance(x, str) for x in brands) or brands and not {'eletrovias'}.intersection(brands):
  raise GatewayError(403, 'brand_not_allowed')


def serialize(value):
 if isinstance(value, (dt.date, dt.datetime)): return value.isoformat()
 if isinstance(value, decimal.Decimal): return float(value)
 raise TypeError('unsupported_response_type')


MEDIA_IDS = {('google','2319926905','23778217190'), *{('meta','2424035941347251',c) for c in ['52585384013024','52671387111024','52682815187224','52683550378024']}}
# Negócio criado no CRM sem contato (Closer cria à mão, contato ainda não ligado no RD)
# não vira pessoa fictícia: sai das linhas e entra na contagem técnica `accepted_missing_contact`.
# Antes era uma lista fixa de IDs, e cada negócio novo assim derrubava a leitura da marca inteira
# (30/10/2026: dois negócios Odonto Legacy da Thaina tiraram a Visão Geral do ar).

def missing_commercial_identity(row):
 return row.get('dados_extras',{}).get('classification_source')=='deal_criado_crm' and (
  not row.get('contato_id') or not (row.get('email') or row.get('telefone')))

def prepare_rows(dataset, rows):
 validate_rows(dataset, rows)
 pending = [r for r in rows if dataset=='leads' and missing_commercial_identity(r)]
 return ([r for r in rows if not (dataset=='leads' and missing_commercial_identity(r))],
  [{'code':'accepted_missing_contact','count':len(pending)}] if pending else [])


def validate_rows(dataset, rows):
 if len(rows) > 50000: raise GatewayError(503, 'result_too_large')
 if any(r.get('marca') not in (('Eletrovias',) if dataset=='leads' else ('Eletrovias',)) or not isinstance(r.get('dia'),str)
  or not '2026-10-01' <= r['dia'] < '2026-11-01' for r in rows):
  raise GatewayError(503, 'scope_violation')
 if len({r.get('id') for r in rows}) != len(rows): raise GatewayError(503,'duplicate_id')
 if dataset=='media' and any((r.get('canal'),r.get('conta_id'),r.get('campanha_id')) not in MEDIA_IDS for r in rows):
  raise GatewayError(503,'campaign_scope_violation')
 if dataset=='media' and any(r.get('spend_brl') is None or r['spend_brl']<0 or r.get('moeda')!='BRL' for r in rows):
  raise GatewayError(409,'invalid_media')


class Service:
 def __init__(self, settings, connect=None, request_json=None):
  self.settings = settings
  self.queries = dict(QUERIES)
  if settings.get('negocios_enabled') is True:
   self.queries['negocios'] = DEALS_QUERY
  self.slots = threading.BoundedSemaphore(1)
  self.cache = {}
  self.cache_lock = threading.Lock()
  if connect is None:
   import psycopg
   from psycopg.rows import dict_row
   pg = settings['postgres']
   if pg.get('dbname') != 'oralunic_dw' or pg.get('user') != 'dashboard_eletrovias_ro' or pg.get('sslmode') != 'verify-full' or not pg.get('sslrootcert'):
    raise ValueError('unsafe_connection')
   self.connect = lambda: psycopg.connect(
    **pg, row_factory=dict_row, connect_timeout=5, application_name='dashboard_eletrovias_ouro',
    options='-c default_transaction_read_only=on -c statement_timeout=45000 -c lock_timeout=1000 -c search_path=pg_catalog -c timezone=UTC')
  else: self.connect = connect
  self.request_json = request_json or self.auth_request

 def auth_request(self, path, token, body):
  headers = {'apikey': self.settings['supabase_anon_key'], 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
  request = urllib.request.Request(self.settings['supabase_url'] + path, headers=headers,
   data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST')
  try:
   with urllib.request.urlopen(request, timeout=10) as response:
    raw = response.read(1048577)
    if len(raw) > 1048576: raise GatewayError(503, 'auth_response_too_large')
    return json.loads(raw)
  except urllib.error.HTTPError as error:
   raise GatewayError(401 if error.code in (401, 403) else 503, 'auth_unavailable') from None
  except (OSError, ValueError): raise GatewayError(503, 'auth_unavailable') from None

 def read(self, body, token):
  if not isinstance(body, dict) or set(body) != {'dataset','route'} or body.get('dataset') not in self.queries or body.get('route') not in ROUTES:
   raise GatewayError(400, 'invalid_request')
  authorize(token, self.request_json, body['route'])
  if self.settings.get('mode') == 'legacy': return {'mode': 'legacy'}
  if self.settings.get('mode') != 'ouro': raise GatewayError(503, 'invalid_mode')
  dataset = body['dataset']
  with self.cache_lock: cached = self.cache.get(dataset)
  if cached:
   if time.monotonic() - cached[0] > 300: raise GatewayError(503, 'source_refresh_pending')
   return cached[1]
  return self.refresh_dataset(dataset)

 def refresh_dataset(self, dataset):
  if not self.slots.acquire(timeout=10): raise GatewayError(429, 'busy')
  try:
   with self.connect() as connection:
    connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    role = connection.execute("SELECT current_user u,(SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) unsafe").fetchone()
    if role['u'] != 'dashboard_eletrovias_ro' or role['unsafe']: raise GatewayError(503, 'unsafe_role')
    rows = connection.execute(self.queries[dataset]).fetchall()
    contact_rows, warnings = prepare_deals(rows) if dataset=='negocios' else prepare_rows(dataset, rows)
    result = {'mode':'ouro','contract':'eletrovias_negocios_v1' if dataset=='negocios' else CONTRACT,'dataset':dataset,'rows':contact_rows,
     'observed_at':max((r.get('carregado_em') for r in rows if r.get('carregado_em')),default=None),'warnings':warnings}
    with self.cache_lock: self.cache[dataset] = (time.monotonic(), result)
    return result

  finally: self.slots.release()


class Handler(BaseHTTPRequestHandler):
 service = None
 def log_message(self, *args): pass
 def respond(self, status, body):
  raw = json.dumps(body, default=serialize, ensure_ascii=False, allow_nan=False).encode()
  self.send_response(status)
  self.send_header('Content-Type', 'application/json')
  self.send_header('Cache-Control', 'no-store')
  self.send_header('X-Content-Type-Options', 'nosniff')
  self.send_header('Content-Length', str(len(raw)))
  self.end_headers()
  self.wfile.write(raw)
 def do_GET(self):
  if self.path == '/health': self.respond(200, {'status': 'up', 'service': 'eletrovias-ouro'})
  else: self.respond(404, {'code': 'not_found'})
 def do_POST(self):
  if self.path != '/api/eletrovias-ouro/v1/read': self.respond(404, {'code': 'not_found'}); return
  try:
   size = int(self.headers.get('Content-Length', '0'))
   if not 0 < size <= 4096: raise GatewayError(413, 'body_too_large')
   header = self.headers.get('Authorization', '')
   if not header.startswith('Bearer '): raise GatewayError(401, 'session_required')
   result = self.service.read(json.loads(self.rfile.read(size)), header[7:])
   self.respond(200, result)
  except GatewayError as error: self.respond(error.status, {'code': error.code})
  except (ValueError, TypeError): self.respond(400, {'code': 'invalid_request'})
  except Exception: self.respond(503, {'code': 'source_unavailable'})


def maintain_cache(service):
 while True:
  time.sleep(240)
  for dataset in service.queries:
   try: service.refresh_dataset(dataset)
   except Exception: pass  # Resposta expirada falha fechada; nunca expor diagnóstico/credencial.


def main():
 settings = json.loads(Path(os.environ.get('ELETROVIAS_OURO_CONFIG', '/run/eletrovias/config.json')).read_text())
 Handler.service = Service(settings)
 if settings.get('mode') == 'ouro':
  for dataset in Handler.service.queries: Handler.service.refresh_dataset(dataset)
  threading.Thread(target=maintain_cache,args=(Handler.service,),daemon=True).start()
 ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()


if __name__ == '__main__': main()
