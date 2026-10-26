"""Gateway isolado para contagens diárias de inscrições Beauty na ouro."""
from __future__ import annotations

import datetime as dt
import json
import os
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONTRACT = 'beauty_inscricoes_v1'
QUERY = 'SELECT dia,inscricoes,observado_em FROM ouro.vw_beauty_inscricoes_dia ORDER BY dia LIMIT 5001'


class GatewayError(Exception):
 def __init__(self, status, code): self.status, self.code = status, code


def authorize(token, request_json):
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
 if not isinstance(permissions, list) or 'aba.sop-marketing' not in permissions:
  raise GatewayError(403, 'tab_not_allowed')
 if not isinstance(brands, list) or any(not isinstance(x, str) for x in brands) or brands and 'we-scale' not in brands:
  raise GatewayError(403, 'brand_not_allowed')


def serialize(value):
 if isinstance(value, (dt.date, dt.datetime)): return value.isoformat()
 raise TypeError('unsupported_response_type')


class Service:
 def __init__(self, settings, connect=None, request_json=None):
  self.settings = settings
  self.slots = threading.BoundedSemaphore(3)
  if connect is None:
   import psycopg
   from psycopg.rows import dict_row
   pg = settings['postgres']
   if pg.get('dbname') != 'oralunic_dw' or pg.get('user') != 'dashboard_beauty_ro' or pg.get('sslmode') != 'verify-full' or not pg.get('sslrootcert'):
    raise ValueError('unsafe_connection')
   self.connect = lambda: psycopg.connect(
    **pg, row_factory=dict_row, connect_timeout=5, application_name='dashboard_beauty_ouro',
    options='-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=1000 -c search_path=pg_catalog -c timezone=UTC')
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
  if not isinstance(body, dict) or body != {'dataset': 'inscricoes', 'route': '/sop-marketing'}:
   raise GatewayError(400, 'invalid_request')
  authorize(token, self.request_json)
  if self.settings.get('mode') == 'legacy': return {'mode': 'legacy'}
  if self.settings.get('mode') != 'ouro': raise GatewayError(503, 'invalid_mode')
  if not self.slots.acquire(timeout=10): raise GatewayError(429, 'busy')
  try:
   with self.connect() as connection:
    connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    role = connection.execute("SELECT current_user u,(SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) unsafe").fetchone()
    if role['u'] != 'dashboard_beauty_ro' or role['unsafe']: raise GatewayError(503, 'unsafe_role')
    rows = connection.execute(QUERY).fetchall()
    if len(rows) > 5000: raise GatewayError(503, 'result_too_large')
    if any(not isinstance(r.get('dia'), dt.date) or not isinstance(r.get('inscricoes'), int) or r['inscricoes'] < 0 for r in rows):
     raise GatewayError(503, 'invalid_contract')
    if len({r['dia'] for r in rows}) != len(rows): raise GatewayError(503, 'duplicate_day')
    return {'mode': 'ouro', 'contract': CONTRACT, 'dataset': 'inscricoes',
     'rows': [{'dia': r['dia'], 'inscricoes': r['inscricoes']} for r in rows],
     'observed_at': max((r['observado_em'] for r in rows if r['observado_em']), default=None)}
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
  if self.path == '/health': self.respond(200, {'status': 'up', 'service': 'beauty-ouro'})
  else: self.respond(404, {'code': 'not_found'})
 def do_POST(self):
  if self.path != '/api/beauty-ouro/v1/read': self.respond(404, {'code': 'not_found'}); return
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


def main():
 settings = json.loads(Path(os.environ.get('BEAUTY_OURO_CONFIG', '/run/beauty/config.json')).read_text())
 Handler.service = Service(settings)
 ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()


if __name__ == '__main__': main()
