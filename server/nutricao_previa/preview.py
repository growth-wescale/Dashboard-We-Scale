"""Servidor local da prévia, com sessão e acesso total exigidos a cada leitura."""
import json
import os
import sys
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from prepare import DEFAULT_SNAPSHOT

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'marketing_mensal_previa'))
import preview as monthly

monthly.LOCAL = 'http://127.0.0.1:4175'
monthly.OLD.add('/api/nutricao-ouro/v1/resumo')


def allowed(access):
    return isinstance(access, dict) and all(access.get(k) is True for k in ('ativo', 'registrado', 'acesso_total'))


class Handler(monthly.Handler):
    def __init__(self, *args, **kwargs):
        SimpleHTTPRequestHandler.__init__(self, *args, directory=os.getenv('WESCALE_NUTRICAO_DIST', 'dist'), **kwargs)

    def do_POST(self):
        if self.path != '/api/previa-nutricao/v1/resumo':
            return super().do_POST()
        if self.headers.get('Host') != '127.0.0.1:4175' or self.headers.get('Origin') != monthly.LOCAL:
            return self.send_error(403)
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 64:
                return self.send_error(413)
            if json.loads(self.rfile.read(size)) != {}:
                return self.send_error(400)
            token = self.headers.get('Authorization', '')
            if not token.startswith('Bearer ') or len(token) > 8200:
                return self.send_error(401)
            req = Request('https://jmuluoksnlqrvzbcltim.supabase.co/rest/v1/rpc/minhas_permissoes', data=b'{}',
                          headers={'Authorization': token, 'Content-Type': 'application/json', 'apikey': self.server.public_key})
            with urlopen(req, timeout=10) as res:
                access = json.load(res)
            if not allowed(access):
                return self.send_error(403)
            data = json.loads(Path(os.getenv('WESCALE_NUTRICAO_SNAPSHOT', DEFAULT_SNAPSHOT)).read_text())
            return self.reply(200, data)
        except HTTPError as e:
            return self.reply(e.code, {'code': 'access_unavailable'})
        except (ValueError, TypeError):
            return self.reply(400, {'code': 'invalid_request'})
        except Exception:
            return self.reply(503, {'code': 'source_unavailable'})


if __name__ == '__main__':
    env = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines() if line.startswith('VITE_'))
    server = ThreadingHTTPServer(('127.0.0.1', 4175), Handler)
    server.public_key = env['VITE_SUPABASE_ANON_KEY'].strip('"\'')
    server.serve_forever()
