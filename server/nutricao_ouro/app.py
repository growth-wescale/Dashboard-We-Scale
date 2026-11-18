"""Leitura fixa da ouro pelo Metabase, sem comandos RD ou SQL recebidos do cliente."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import sys
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'nutricao_previa'))
from prepare import fetch_snapshot

BASE = '/api/nutricao-ouro'
REFRESH_SECONDS = 3600
MAX_AGE = 7200
AUTH_URL = 'https://jmuluoksnlqrvzbcltim.supabase.co'


class Error(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


def allowed(access):
    if not isinstance(access, dict) or access.get('ativo') is not True or access.get('registrado') is not True:
        return False
    if access.get('acesso_total') is True:
        return True
    return ('marcas' in access and access['marcas'] is None and access.get('marca') is None
            and isinstance(access.get('permissoes'), list) and 'aba.nutricao' in access['permissoes'])


def authorize(settings, token):
    if not token or len(token) > 8192:
        raise Error(401, 'session_required')
    headers = {'Authorization': 'Bearer ' + token, 'apikey': settings['supabase_anon_key'], 'Content-Type': 'application/json'}

    def auth(path, data=None):
        try:
            with urlopen(Request(AUTH_URL + path, data=data, headers=headers), timeout=10) as res:
                return json.load(res)
        except HTTPError as e:
            raise Error(401 if e.code in (401, 403) else 503, 'auth_unavailable') from None

    user = auth('/auth/v1/user')
    if not isinstance(user, dict) or not user.get('id') or user.get('is_anonymous') is True:
        raise Error(401, 'invalid_session')
    if not allowed(auth('/rest/v1/rpc/minhas_permissoes', b'{}')):
        raise Error(403, 'access_denied')


class Cache:
    def __init__(self, settings):
        self.settings = settings
        self.snapshot = None
        self.lock = threading.Lock()
        self.refresh_lock = threading.Lock()
        self.stop = threading.Event()

    def refresh(self):
        # Uma fotografia completa, sem leituras extras disparadas por visitantes.
        with self.refresh_lock:
            catalog = json.loads((Path(__file__).resolve().parents[1] / 'nutricao_previa/catalogo.json').read_text())
            data = fetch_snapshot(self.settings['metabase_key'], catalog)
            data['modo'] = 'automatico'
            payload = json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()
            with self.lock:
                self.snapshot = (time.monotonic(), payload, data['gerado'])
            print('refresh_ok', data['gerado'], flush=True)

    def maintain(self):
        while not self.stop.is_set():
            delay = REFRESH_SECONDS
            try:
                self.refresh()
            except Exception as e:
                # Mensagens de HTTP/SQL podem conter detalhes internos; só o tipo.
                print('refresh_failed', type(e).__name__, flush=True)
                delay = 60
            self.stop.wait(delay)

    def current(self):
        with self.lock:
            if self.snapshot is None or time.monotonic() - self.snapshot[0] >= MAX_AGE:
                raise Error(503, 'source_refresh_pending')
            return self.snapshot


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, data):
        payload = data if isinstance(data, bytes) else json.dumps(data).encode()
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
        if not self.server.slots.acquire(blocking=False):
            return self.reply(429, {'code': 'busy'})
        try:
            header = self.headers.get('Authorization', '')
            if not header.startswith('Bearer '):
                raise Error(401, 'session_required')
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 64:
                raise Error(413, 'invalid_size')
            if json.loads(self.rfile.read(size)) != {}:
                raise Error(400, 'invalid_request')
            authorize(self.server.cache.settings, header[7:])
            self.reply(200, self.server.cache.current()[1])
        except Error as e:
            self.reply(e.status, {'code': e.code})
        except (ValueError, TypeError):
            self.reply(400, {'code': 'invalid_request'})
        except Exception:
            self.reply(503, {'code': 'unavailable'})
        finally:
            self.server.slots.release()

    def setup(self):
        super().setup()
        self.connection.settimeout(25)


if __name__ == '__main__':
    settings = json.loads(Path('/run/nutricao/config.json').read_text())
    server = ThreadingHTTPServer(('0.0.0.0', 8080), Handler)
    server.slots = threading.BoundedSemaphore(8)
    server.cache = Cache(settings)
    threading.Thread(target=server.cache.maintain, daemon=True).start()
    server.serve_forever()
