"""Gateway dos agregados de WhatsApp. As consultas e a autorização são fixas."""
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'whatsapp_previa'))
from prepare import abrir_lotes, consolidar_modelos
from schema import FUNCTIONS, ROLE

BASE = '/api/whatsapp-ouro'
FIRST = date(2026, 9, 1)
REFRESH_SECONDS = 3600
MAX_AGE = 2 * REFRESH_SECONDS
BRASILIA = ZoneInfo('America/Sao_Paulo')


class Error(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


def periodos(fim):
    inicio = FIRST
    while inicio <= fim:
        proximo = (inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
        yield inicio, min(proximo - timedelta(days=1), fim)
        inicio = proximo


def autorizar(settings, token):
    if not token or len(token) > 8192:
        raise Error(401, 'session_required')
    headers = {'Authorization': 'Bearer ' + token, 'apikey': settings['supabase_anon_key'], 'Content-Type': 'application/json'}

    def auth(path, data=None):
        try:
            with urlopen(Request(settings['supabase_url'] + path, data=data, headers=headers), timeout=10) as response:
                return json.load(response)
        except HTTPError as e:
            raise Error(401 if e.code in (401, 403) else 503, 'auth_unavailable') from None

    user = auth('/auth/v1/user')
    if not isinstance(user, dict) or not user.get('id') or user.get('is_anonymous') is True:
        raise Error(401, 'invalid_session')
    access = auth('/rest/v1/rpc/minhas_permissoes', b'{}')
    if not isinstance(access, dict) or not all(access.get(k) is True for k in ('registrado', 'ativo', 'acesso_total')):
        raise Error(403, 'access_denied')


def carregar(settings, fim):
    import psycopg
    pg = settings['postgres']
    if pg['user'] != ROLE or pg['dbname'] != 'oralunic_dw' or pg['sslmode'] != 'verify-full' or not pg['sslrootcert']:
        raise ValueError('unsafe_connection')
    contas, modelos = [], []
    with psycopg.connect(**pg, connect_timeout=10, application_name=ROLE,
                         options='-c default_transaction_read_only=on -c statement_timeout=180000 -c search_path=pg_catalog -c timezone=UTC') as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        for inicio, ultimo in periodos(fim):
            for name, dest in [('contas', contas), ('eventos', modelos)]:
                rows = [r[0] for r in conn.execute('SELECT * FROM ' + FUNCTIONS[name] + '(%s,%s)', (inicio, ultimo))]
                dest.extend(rows if name == 'contas' else abrir_lotes(rows))
    for rows, keys in [(contas, ('conta', 'dia')), (modelos, ('conta', 'dia', 'id', 'produto'))]:
        if len({tuple(r[k] for k in keys) for r in rows}) != len(rows):
            raise ValueError('duplicate_rows')
    if not any(r.get('entrega_ok') for r in contas):
        raise ValueError('coverage_missing')
    eventos, finalidades = consolidar_modelos(modelos)
    return dict(versao=2, inicio=FIRST.isoformat(), fim=fim.isoformat(),
                gerado=datetime.now(timezone.utc).isoformat(), contas=contas, eventos=eventos, finalidades=finalidades)


class Cache:
    def __init__(self, settings):
        self.settings = settings
        self.snapshot = None
        self.lock = threading.Lock()

    def maintain(self):
        while True:
            try:
                data = carregar(self.settings, datetime.now(BRASILIA).date())
                payload = json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()
                with self.lock:
                    self.snapshot = (time.monotonic(), payload, data['gerado'])
                print('refresh_ok', data['gerado'], flush=True)
                time.sleep(REFRESH_SECONDS)
            except Exception as e:
                print('refresh_failed', type(e).__name__, getattr(e, 'sqlstate', '') or '', flush=True)
                time.sleep(60)

    def current(self):
        with self.lock:
            if self.snapshot is None or time.monotonic() - self.snapshot[0] > MAX_AGE:
                raise Error(503, 'source_refresh_pending')
            return self.snapshot


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body):
        payload = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path != '/health':
            return self.reply(404, {'code': 'not_found'})
        try:
            self.reply(200, {'gerado': self.server.cache.current()[2]})
        except Error as e:
            self.reply(e.status, {'code': e.code})

    def do_POST(self):
        if self.path != BASE + '/v1/resumo':
            return self.reply(404, {'code': 'not_found'})
        try:
            header = self.headers.get('Authorization', '')
            if not header.startswith('Bearer '):
                raise Error(401, 'session_required')
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 4096:
                raise Error(413, 'invalid_size')
            if json.loads(self.rfile.read(size)) != {}:
                raise Error(400, 'invalid_request')
            autorizar(self.server.cache.settings, header[7:])
            self.reply(200, self.server.cache.current()[1])
        except Error as e:
            self.reply(e.status, {'code': e.code})
        except (TypeError, ValueError):
            self.reply(400, {'code': 'invalid_request'})
        except Exception:
            self.reply(503, {'code': 'unavailable'})


if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', 8080), Handler)
    server.cache = Cache(json.loads(Path('/run/whatsapp/config.json').read_text()))
    threading.Thread(target=server.cache.maintain, daemon=True).start()
    server.serve_forever()
