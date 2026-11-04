"""Read-only October 2026 Marketing gateway. Filter the shared cache for each session."""
from datetime import date, datetime
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from perfil import linha_negocio

BRANDS = {'inpot': 'Inpot', 'b2case': 'B2Case', 'viva': 'Viva'}
ROUTES = {'/': 'aba.visao-geral', '/marca': 'aba.saude-marca',
          '/sop-marketing': 'aba.sop-marketing', '/okrs': 'aba.okrs', '/copa-b2b': 'aba.okrs'}
ROLE = 'dashboard_outubro_marketing_ro'
QUERIES = {name: f'SELECT * FROM ouro.vw_outubro_marketing_{name} ORDER BY {order} LIMIT 50001'
           for name, order in [('captacoes', 'dia,id'), ('negocios', 'dia,negocio_id'), ('midia', 'dia,id')]}


class Error(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


def allowed_brands(access, route):
    if not isinstance(access, dict) or access.get('registrado') is not True or access.get('ativo') is not True:
        raise Error(403, 'inactive_user')
    if access.get('acesso_total') is True:
        return set(BRANDS.values())
    permissions = access.get('permissoes')
    if not isinstance(permissions, list) or ROUTES[route] not in permissions:
        raise Error(403, 'tab_not_allowed')
    brands = access.get('marcas')
    if brands is None or brands == []:
        brands = [access['marca']] if access.get('marca') else list(BRANDS)
    if not isinstance(brands, list) or any(not isinstance(x, str) for x in brands):
        raise Error(403, 'invalid_brands')
    return {BRANDS[x] for x in brands if x in BRANDS}


def json_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError('unsupported_value')


class Gateway:
    def __init__(self, settings):
        self.settings = settings
        self.lock = threading.Lock()
        self.snapshot = None

    def auth(self, path, token, body=None):
        req = Request(self.settings['supabase_url'] + path, data=body, headers={
            'Authorization': 'Bearer ' + token, 'apikey': self.settings['supabase_anon_key'], 'Content-Type': 'application/json'})
        try:
            with urlopen(req, timeout=10) as res:
                return json.loads(res.read(1048576))
        except HTTPError as e:
            raise Error(401 if e.code in (401, 403) else 503, 'auth_unavailable') from None

    def refresh(self):
        import psycopg
        from psycopg.rows import dict_row
        pg = self.settings['postgres']
        if pg.get('dbname') != 'oralunic_dw' or pg.get('user') != ROLE or pg.get('sslmode') != 'verify-full' or not pg.get('sslrootcert'):
            raise ValueError('unsafe_connection')
        with psycopg.connect(**pg, row_factory=dict_row, connect_timeout=5, application_name='dashboard_outubro_ouro',
                             options='-c default_transaction_read_only=on -c statement_timeout=45000 -c lock_timeout=1000 -c search_path=pg_catalog -c timezone=UTC') as conn:
            conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
            role = conn.execute('SELECT rolname, rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls AS unsafe FROM pg_roles WHERE rolname=current_user').fetchone()
            if role['rolname'] != ROLE or role['unsafe']:
                raise ValueError('unsafe_role')
            data = {name: conn.execute(sql).fetchall() for name, sql in QUERIES.items()}
        if any(len(rows) > 50000 for rows in data.values()):
            raise ValueError('too_many_rows')
        datasets = {'leads': data['captacoes'] + [linha_negocio(r) for r in data['negocios']], 'media': data['midia']}
        for rows in datasets.values():
            if len({r['id'] for r in rows}) != len(rows) or any(not r['id'] or r['marca'] not in BRANDS.values()
                    or not '2026-10-01' <= r['dia'] < '2026-11-01' for r in rows):
                raise ValueError('invalid_scope')
        with self.lock:
            self.snapshot = time.monotonic(), datetime.now().astimezone().isoformat(), datasets

    def maintain(self):
        delay = 180
        while True:
            time.sleep(delay)
            try:
                self.refresh()
                delay = 180
            except Exception:
                delay = 15
                print('refresh_failed', flush=True)

    def read(self, body, token):
        if not isinstance(body, dict) or set(body) != {'route', 'dataset'} or body['route'] not in ROUTES or body['dataset'] not in ('leads', 'media'):
            raise Error(400, 'invalid_request')
        if not token or len(token) > 8192:
            raise Error(401, 'session_required')
        user = self.auth('/auth/v1/user', token)
        if not isinstance(user, dict) or not user.get('id') or user.get('is_anonymous') is True:
            raise Error(401, 'invalid_session')
        brands = allowed_brands(self.auth('/rest/v1/rpc/minhas_permissoes', token, b'{}'), body['route'])
        with self.lock:
            stamp, observed, datasets = self.snapshot
        if time.monotonic() - stamp > 300:
            raise Error(503, 'source_refresh_pending')
        return {'mode': 'ouro', 'contract': 'outubro_marketing_v1', 'dataset': body['dataset'], 'observed_at': observed,
                'warnings': [], 'rows': [r for r in datasets[body['dataset']] if r['marca'] in brands]}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body):
        payload = json.dumps(body, default=json_value, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == '/health':
            self.reply(200, {'status': 'up'})
        else:
            self.reply(404, {'code': 'not_found'})

    def do_POST(self):
        if self.path != '/api/outubro-ouro/v1/read':
            return self.reply(404, {'code':'not_found'})
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 4096:
                raise Error(413, 'invalid_size')
            auth = self.headers.get('Authorization','')
            if not auth.startswith('Bearer '):
                raise Error(401, 'session_required')
            result = self.server.gateway.read(json.loads(self.rfile.read(size)), auth[7:])
        except Error as e:
            return self.reply(e.status, {'code':e.code})
        except (TypeError, ValueError):
            return self.reply(400, {'code':'invalid_request'})
        except Exception:
            return self.reply(503, {'code':'unavailable'})
        self.reply(200, result)


if __name__ == '__main__':
    gateway = Gateway(json.loads(Path('/run/outubro/config.json').read_text()))
    gateway.refresh()
    threading.Thread(target=gateway.maintain, daemon=True).start()
    server = ThreadingHTTPServer(('0.0.0.0', 8080), Handler)
    server.gateway = gateway
    server.serve_forever()
