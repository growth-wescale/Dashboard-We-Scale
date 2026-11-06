"""Gateway mensal preparado para instalação separada. SQL fixo, somente ouro."""
from collections import OrderedDict
from datetime import date, datetime
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.append(str(Path(__file__).resolve().parent.parent / 'outubro_ouro'))
from perfil import linha_negocio

ROLE = 'dashboard_marketing_mensal_ro'
CONTRACT = 'marketing_mensal_v1'
BASE = '/api/marketing-mensal-ouro'
PREFIX = 'ouro.vw_marketing_mensal_'
ROUTES = {'/': 'aba.visao-geral', '/marca': 'aba.saude-marca',
          '/sop-marketing': 'aba.sop-marketing', '/okrs': 'aba.okrs', '/copa-b2b': 'aba.okrs'}
BRANDS = {'inpot': {'Inpot'}, 'b2case': {'B2Case'}, 'viva': {'Viva'},
          'eletrovias': {'Eletrovias'}, 'liso-laser': {'Lisô Laser', 'Beauty Connection'},
          'oral-unic': {'Oral Unic', 'Odonto Scale'}, 'odonto-scale': {'Odonto Scale'}}
ALL_BRANDS = set().union(*BRANDS.values())
LEGACY_IDS = {'120248355011530752', '24054007136', '24054143009'}
MAX_ROWS = 50000


class Error(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


def json_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError('unsupported_value')


def allowed_brands(access, route):
    if not isinstance(access, dict) or access.get('registrado') is not True or access.get('ativo') is not True:
        raise Error(403, 'inactive_user')
    if access.get('acesso_total') is True:
        return ALL_BRANDS
    permissions = access.get('permissoes')
    if not isinstance(permissions, list) or ROUTES[route] not in permissions:
        raise Error(403, 'tab_not_allowed')
    brands = access.get('marcas')
    if brands is None or brands == []:
        brands = [access['marca']] if access.get('marca') else list(BRANDS)
    if not isinstance(brands, list) or any(not isinstance(x, str) for x in brands):
        raise Error(403, 'invalid_brands')
    return set().union(*(BRANDS.get(x, set()) for x in brands))


def row_brand(row):
    # O formato histórico de mídia da conta compartilhada usa Oral Unic. A ACL
    # considera a frente real, sem mudar a marca/valor devolvidos ao consumidor.
    if row.get('marca') == 'Oral Unic' and str(row.get('campanha_id')) in LEGACY_IDS:
        return 'Odonto Scale'
    return row.get('marca')


def period(raw):
    if not isinstance(raw, dict) or set(raw) != {'inicio', 'fim'}:
        raise Error(400, 'invalid_period')
    try:
        start, end = (date.fromisoformat(raw[k]) for k in ('inicio', 'fim'))
        if any(raw[k] != d.isoformat() for k, d in [('inicio', start), ('fim', end)]):
            raise ValueError()
    except (ValueError, TypeError):
        raise Error(400, 'invalid_period') from None
    if not date(2026, 11, 1) <= start <= end:
        raise Error(400, 'invalid_period')
    return start.isoformat(), end.isoformat()


def datasets(raw, start, end):
    if any(len(rows) > MAX_ROWS for rows in raw.values()):
        raise Error(503, 'result_too_large')
    leads = []
    for source in ('captacoes', 'contatos'):
        for item in raw[source]:
            row = dict(item)
            extra = row.get('dados_extras')
            if isinstance(extra, str):
                extra = json.loads(extra)
            if not isinstance(extra, dict) or extra.get('metric_grain') != 'contact_only':
                raise Error(503, 'invalid_contact')
            leads.append({**row, 'dados_extras': extra})
    for item in raw['negocios']:
        row = linha_negocio(item)
        row['dados_extras']['origem_leitura'] = 'previa_mensal_ouro'
        if row['marca'] == 'Oral Unic':
            row['dados_extras']['segmento'] = 'oral-unic'
        leads.append(row)
    result = {'leads': leads, 'media': raw['midia']}
    for rows in result.values():
        if len(rows) > MAX_ROWS or len({r.get('id') for r in rows}) != len(rows):
            raise Error(503, 'invalid_rows')
        if any(not r.get('id') or r.get('marca') not in ALL_BRANDS
               or not isinstance(r.get('dia'), str) or not start <= r['dia'] <= end for r in rows):
            raise Error(503, 'scope_violation')
    if any(r.get('origem_leitura') != 'ouro_marketing_mensal'
           or not isinstance(r.get('spend_brl'), (int, float, Decimal)) or r['spend_brl'] < 0 for r in result['media']):
        raise Error(503, 'invalid_media')
    return result


class Gateway:
    def __init__(self, settings):
        self.settings = settings
        self.lock = threading.RLock()
        self.refresh_lock = threading.Lock()
        self.cache = OrderedDict()
        self.receipt = None

    def auth(self, path, token, body=None):
        req = Request(self.settings['supabase_url'] + path, data=body, headers={
            'Authorization': 'Bearer ' + token, 'apikey': self.settings['supabase_anon_key'], 'Content-Type': 'application/json'})
        try:
            with urlopen(req, timeout=10) as res:
                return json.loads(res.read(1048576))
        except HTTPError as e:
            raise Error(401 if e.code in (401, 403) else 503, 'auth_unavailable') from None

    def connect(self):
        import psycopg
        from psycopg.rows import dict_row
        pg = self.settings['postgres']
        if (pg.get('dbname') != 'oralunic_dw' or pg.get('user') != ROLE
                or pg.get('sslmode') != 'verify-full' or not pg.get('sslrootcert')):
            raise Error(503, 'unsafe_connection')
        return psycopg.connect(**pg, row_factory=dict_row, connect_timeout=5,
            application_name='dashboard_marketing_mensal_ouro',
            options='-c default_transaction_read_only=on -c statement_timeout=45000 -c lock_timeout=1000 -c search_path=pg_catalog -c timezone=UTC')

    def load(self, key=None):
        with self.connect() as conn:
            conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
            role = conn.execute('SELECT rolname, rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls AS unsafe FROM pg_roles WHERE rolname=current_user').fetchone()
            if role['rolname'] != ROLE or role['unsafe']:
                raise Error(503, 'unsafe_role')
            receipt = conn.execute('SELECT dia,publicado FROM ' + PREFIX + 'cobertura').fetchone()
            if not receipt or not receipt.get('publicado'):
                raise Error(503, 'publication_missing')
            date.fromisoformat(receipt['dia'])
            if key is None:
                return receipt, None
            start, requested_end = key
            end = min(requested_end, receipt['dia'])
            if start > end:
                return receipt, None
            raw = {name: conn.execute('SELECT * FROM ' + PREFIX + name
                   + ' WHERE dia >= %s AND dia <= %s ORDER BY dia,' + order + ' LIMIT 50001', (start, end)).fetchall()
                   for name, order in [('captacoes', 'id'), ('contatos', 'id'), ('negocios', 'negocio_id'), ('midia', 'id')]}
            return receipt, datasets(raw, start, end)

    def refresh(self, key=None):
        # Um único snapshot/transação alimenta leads+mídia de cada período.
        with self.refresh_lock:
            receipt, data = self.load(key)
            stamp = time.monotonic()
            with self.lock:
                self.receipt = (stamp, receipt)
                if key is not None:
                    self.cache[key] = (stamp, receipt, data)
                    self.cache.move_to_end(key)
                    while len(self.cache) > 8:
                        self.cache.popitem(last=False)

    def maintain(self):
        while True:
            time.sleep(15)
            with self.lock:
                keys = [k for k, (at, _, _) in self.cache.items() if time.monotonic() - at >= 180]
                status_due = not self.receipt or time.monotonic() - self.receipt[0] >= 180
            for key in keys or ([None] if status_due else []):
                try:
                    self.refresh(key)
                except Exception:
                    print('refresh_failed', flush=True)

    def status(self):
        with self.lock:
            receipt = self.receipt
        if not receipt or time.monotonic() - receipt[0] > 300:
            raise Error(503, 'source_refresh_pending')
        return receipt[1]

    def read(self, body, token):
        if (not isinstance(body, dict) or set(body) != {'route', 'dataset', 'periodo'}
                or body.get('route') not in ROUTES or body.get('dataset') not in ('leads', 'media')):
            raise Error(400, 'invalid_request')
        key = period(body['periodo'])
        if not token or len(token) > 8192:
            raise Error(401, 'session_required')
        user = self.auth('/auth/v1/user', token)
        if not isinstance(user, dict) or not user.get('id') or user.get('is_anonymous') is True:
            raise Error(401, 'invalid_session')
        brands = allowed_brands(self.auth('/rest/v1/rpc/minhas_permissoes', token, b'{}'), body['route'])
        if not brands:
            raise Error(403, 'brand_not_allowed')
        with self.lock:
            entry = self.cache.get(key)
        if entry is None:
            self.refresh(key)
            with self.lock:
                entry = self.cache.get(key)
        if not entry or time.monotonic() - entry[0] > 300:
            raise Error(503, 'source_refresh_pending')
        _, receipt, data = entry
        if data is None:
            raise Error(409, 'periodo_sem_publicacao')
        return {'mode': 'ouro', 'contract': CONTRACT, 'dataset': body['dataset'],
                'observed_at': receipt['publicado'], 'through': receipt['dia'],
                'warnings': ['periodo_parcial'] if key[1] > receipt['dia'] else [],
                'rows': [r for r in data[body['dataset']] if row_brand(r) in brands]}


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
        if self.path not in ('/health', BASE + '/status'):
            return self.reply(404, {'code': 'not_found'})
        try:
            result = self.server.gateway.status()
            self.reply(200, {'status': 'ready'} if self.path == '/health' else result)
        except Error as e:
            self.reply(e.status, {'code': e.code})

    def do_POST(self):
        if self.path != BASE + '/v1/read':
            return self.reply(404, {'code': 'not_found'})
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 4096:
                raise Error(413, 'invalid_size')
            auth = self.headers.get('Authorization', '')
            if not auth.startswith('Bearer '):
                raise Error(401, 'session_required')
            result = self.server.gateway.read(json.loads(self.rfile.read(size)), auth[7:])
            self.reply(200, result)
        except Error as e:
            self.reply(e.status, {'code': e.code})
        except (TypeError, ValueError):
            self.reply(400, {'code': 'invalid_request'})
        except Exception:
            self.reply(503, {'code': 'unavailable'})


if __name__ == '__main__':
    gateway = Gateway(json.loads(Path('/run/marketing-mensal/config.json').read_text()))
    gateway.refresh()
    threading.Thread(target=gateway.maintain, daemon=True).start()
    server = ThreadingHTTPServer(('0.0.0.0', 8080), Handler)
    server.gateway = gateway
    server.serve_forever()
