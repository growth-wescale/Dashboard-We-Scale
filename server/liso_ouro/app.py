"""Gateway isolado Marketing Lisô/Beauty; SQL fixo, ouro exclusiva e sem escrita."""
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

CONTRACT = 'liso_beauty_marketing_v1'
QUERIES = {
 'leads': 'SELECT * FROM ouro.vw_liso_beauty_dashboard_leads ORDER BY dia DESC,id LIMIT 50001',
 'media': 'SELECT * FROM ouro.vw_liso_beauty_dashboard_midia ORDER BY dia DESC,id LIMIT 50001',
}
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
 if not isinstance(brands, list) or any(not isinstance(x, str) for x in brands) or brands and 'liso-laser' not in brands:
  raise GatewayError(403, 'brand_not_allowed')


def serialize(value):
 if isinstance(value, (dt.date, dt.datetime)): return value.isoformat()
 if isinstance(value, decimal.Decimal): return float(value)
 raise TypeError('unsupported_response_type')


class Service:
 def __init__(self, settings, connect=None, request_json=None):
  self.settings = settings
  self.slots = threading.BoundedSemaphore(1)
  self.cache = {}
  self.cache_lock = threading.Lock()
  if connect is None:
   import psycopg
   from psycopg.rows import dict_row
   pg = settings['postgres']
   if pg.get('dbname') != 'oralunic_dw' or pg.get('user') != 'dashboard_liso_ro' or pg.get('sslmode') != 'verify-full' or not pg.get('sslrootcert'):
    raise ValueError('unsafe_connection')
   self.connect = lambda: psycopg.connect(
    **pg, row_factory=dict_row, connect_timeout=5, application_name='dashboard_liso_ouro',
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
  if not isinstance(body, dict) or set(body) != {'dataset','route'} or body.get('dataset') not in QUERIES or body.get('route') not in ROUTES:
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
    if role['u'] != 'dashboard_liso_ro' or role['unsafe']: raise GatewayError(503, 'unsafe_role')
    rows = connection.execute(QUERIES[dataset]).fetchall()
    if len(rows) > 50000: raise GatewayError(503, 'result_too_large')
    if any(r.get('marca') not in ('Lisô Laser','Beauty Connection') or not isinstance(r.get('dia'),str)
     or not '2026-10-01' <= r['dia'] < '2026-11-01' for r in rows):
     raise GatewayError(503, 'scope_violation')
    if len({r.get('id') for r in rows}) != len(rows): raise GatewayError(503,'duplicate_id')
    if dataset=='leads' and any(r.get('dados_extras',{}).get('classification_source')=='deal_criado_crm'
     and (not r.get('contato_id') or not (r.get('email') or r.get('telefone'))) for r in rows):
     raise GatewayError(409,'commercial_identity_incomplete')
    if dataset=='media' and any(r.get('spend_brl') is None or r['spend_brl']<0 or r.get('moeda')!='BRL' for r in rows):
     raise GatewayError(409,'invalid_media')
    result = {'mode':'ouro','contract':CONTRACT,'dataset':dataset,'rows':rows,
     'observed_at':max((r.get('carregado_em') for r in rows if r.get('carregado_em')),default=None),'warnings':[]}
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
  if self.path == '/health': self.respond(200, {'status': 'up', 'service': 'liso-ouro'})
  else: self.respond(404, {'code': 'not_found'})
 def do_POST(self):
  if self.path != '/api/liso-ouro/v1/read': self.respond(404, {'code': 'not_found'}); return
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
  for dataset in QUERIES:
   try: service.refresh_dataset(dataset)
   except Exception: pass  # Resposta expirada falha fechada; nunca expor diagnóstico/credencial.


def main():
 settings = json.loads(Path(os.environ.get('LISO_OURO_CONFIG', '/run/liso/config.json')).read_text())
 Handler.service = Service(settings)
 if settings.get('mode') == 'ouro':
  for dataset in QUERIES: Handler.service.refresh_dataset(dataset)
  threading.Thread(target=maintain_cache,args=(Handler.service,),daemon=True).start()
 ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()


if __name__ == '__main__': main()
