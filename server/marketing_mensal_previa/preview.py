"""Servidor da prévia local. Executar na raiz do dashboard depois do build de prévia."""
from datetime import date, timedelta
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / 'outubro_ouro'))
from perfil import linha_negocio

HOST = 'https://dashboard.srv1816822.hstgr.cloud'
LOCAL = 'http://127.0.0.1:4173'
METABASE = 'https://metabase.wescale.com.br/api/dataset'
OLD = {'/api/' + name + '-ouro/v1/read' for name in ('outubro','oral-unic','legacy','liso','beauty','eletrovias','partner')}
OLD.add('/api/marketing-mensal-ouro/v1/read')
ROUTES = {'/', '/marca', '/okrs', '/sop-marketing', '/copa-b2b'}


def query(sql):
    if not sql.lstrip().upper().startswith(('SELECT', 'WITH')):
        raise ValueError('read_only')
    key = Path(os.getenv('WESCALE_METABASE_KEY_FILE', Path.home()/'.config/wescale/metabase/api-key.txt')).read_text().strip()
    body = {'database': 3, 'type': 'native', 'native': {'query': sql}, 'parameters': [],
            'constraints': {'max-results': 50001, 'max-results-bare-rows': 50001}}
    request = Request(METABASE, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json','X-API-Key': key})
    with urlopen(request, timeout=55) as res:
        result = json.load(res)
    if result.get('status') != 'completed':
        raise RuntimeError('source_unavailable')
    data = result['data']
    if data.get('rows_truncated') or len(data['rows']) > 50000:
        raise RuntimeError('source_incomplete')
    return [dict(zip((c['name'] for c in data['cols']), row)) for row in data['rows']]


@lru_cache(maxsize=2)
def coverage(bucket):
    rows = query("""SELECT to_char(snapshot_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS dia,
                     recorded_at AS publicado FROM ouro._refresh_receipts WHERE result->>'status'='validated'
                     ORDER BY recorded_at DESC LIMIT 1""")
    if not rows:
        raise RuntimeError('publication_missing')
    return rows[0]


def period(raw):
    if set(raw) != {'inicio', 'fim'}:
        raise ValueError('invalid_period')
    start, end = (date.fromisoformat(raw[k]) for k in ('inicio','fim'))
    if not date(2026,11,1) <= start <= end:
        raise ValueError('invalid_period')
    return start, end


def rows_for(dataset, start, end):
    dates = {'inicio': start.isoformat(), 'fim_exclusivo': (end+timedelta(days=1)).isoformat()}
    def sql(name):
        return (ROOT / (name+'.sql')).read_text().format(**dates)
    if dataset == 'media':
        return query('WITH dados AS (' + sql('midia') + ') SELECT * FROM dados ORDER BY dia,id')
    if dataset != 'leads':
        raise ValueError('invalid_dataset')
    deals = sql('negocios')
    template = (ROOT.parent/'outubro_ouro'/'perfil.sql').read_text()
    profiles = query(template[template.index('WITH negocios'):].replace('/* negocios.sql */', deals))
    contacts = query(sql('contatos').replace('/* negocios.sql */', deals))
    rows = query(sql('captacoes')) + contacts
    for row in rows:
        if isinstance(row['dados_extras'], str):
            row['dados_extras'] = json.loads(row['dados_extras'])
        if not isinstance(row['dados_extras'], dict):
            raise ValueError('invalid_contact_metadata')
    for r in profiles:
        row = linha_negocio(r)
        row['dados_extras']['origem_leitura'] = 'previa_mensal_ouro'
        if row['marca'] == 'Oral Unic':
            row['dados_extras']['segmento'] = 'oral-unic'
        rows.append(row)
    return rows


@lru_cache(maxsize=16)
def monthly(dataset, start, end, publication):
    rows = rows_for(dataset, start, end)
    if len(rows) != len({r['id'] for r in rows}) or any(not start.isoformat() <= r['dia'][:10] <= end.isoformat() for r in rows):
        raise ValueError('invalid_source')
    return {'dataset':dataset,'contract':'marketing_mensal_previa','mode':'ouro','rows':rows,'observed_at':publication,'warnings':[]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory='dist',**kwargs)

    def log_message(self,*args):
        pass

    def reply(self,status,payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.headers.get('Host') != urlsplit(LOCAL).netloc:
            return self.send_error(403)
        if self.path == '/api/marketing-mensal-ouro/status':
            try:
                with urlopen(HOST+self.path, timeout=10) as response:
                    return self.reply(200,json.load(response))
            except Exception:
                return self.reply(503,{'code':'source_unavailable'})
        if self.path == '/api/previa-mensal/status':
            try:
                return self.reply(200,coverage(int(time.monotonic()//60)))
            except Exception:
                return self.reply(503,{'code':'publication_missing'})
        if not Path(self.translate_path(self.path)).is_file():
            self.path='/index.html'
        super().do_GET()

    def do_POST(self):
        if self.headers.get('Origin') != LOCAL or self.headers.get('Host') != urlsplit(LOCAL).netloc:
            return self.send_error(403)
        try:
            size = int(self.headers.get('Content-Length',0))
            if not 0 < size <= 4096:
                return self.send_error(413)
            raw = self.rfile.read(size)
            token = self.headers.get('Authorization','')
            if not token.startswith('Bearer ') or len(token)>8200:
                return self.send_error(401)
            headers = {'Authorization':token,'Content-Type':'application/json'}
            if self.path in OLD:
                with urlopen(Request(HOST+self.path,data=raw,headers=headers),timeout=65) as response:
                    return self.reply(response.status,json.load(response))
            if self.path != '/api/previa-mensal/v1/read':
                return self.send_error(404)
            b = json.loads(raw)
            if set(b) != {'route','dataset','periodo'} or b['route'] not in ROUTES or b['dataset'] not in ('media','leads'):
                return self.send_error(400)
            start,end = period(b['periodo'])
            req = Request('https://jmuluoksnlqrvzbcltim.supabase.co/rest/v1/rpc/minhas_permissoes',data=b'{}',
                          headers={**headers,'apikey':self.server.public_key})
            with urlopen(req,timeout=10) as response:
                access=json.load(response)
            if not all(access.get(k) is True for k in ('ativo','registrado','acesso_total')):
                return self.send_error(403)
            receipt=coverage(int(time.monotonic()//60))
            through=date.fromisoformat(receipt['dia'])
            if start > through:
                return self.reply(409,{'code':'periodo_sem_publicacao','dia':receipt['dia']})
            return self.reply(200,monthly(b['dataset'],start,min(end,through),receipt['publicado']))
        except HTTPError as error:
            if self.path == '/api/marketing-mensal-ouro/v1/read' and error.code == 409:
                return self.reply(409,{'code':'periodo_sem_publicacao'})
            return self.reply(error.code,{'code':'upstream_error'})
        except (TypeError,ValueError,KeyError):
            return self.reply(400,{'code':'invalid_request'})
        except Exception:
            return self.reply(503,{'code':'source_unavailable'})


if __name__ == '__main__':
    env = dict(line.split('=',1) for line in Path('.env').read_text().splitlines() if line.startswith('VITE_'))
    server=ThreadingHTTPServer(('127.0.0.1',4173),Handler)
    server.public_key=env['VITE_SUPABASE_ANON_KEY'].strip('"\'')
    server.serve_forever()
