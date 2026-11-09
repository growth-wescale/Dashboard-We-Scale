"""Gera uma fotografia privada de agregados para a prévia local autenticada."""
import argparse
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
SNAPSHOT = Path.home() / '.cache/wescale/previa-whatsapp/resumo.json'


def consultar(sql):
    key = Path(os.environ.get('WESCALE_METABASE_KEY_FILE', Path.home() / '.config/wescale/metabase/api-key.txt')).read_text().strip()
    payload = {'database': 3, 'type': 'native', 'native': {'query': sql}, 'parameters': [],
               'constraints': {'max-results': 50001, 'max-results-bare-rows': 50001}}
    req = Request('https://metabase.wescale.com.br/api/dataset', data=json.dumps(payload).encode(),
                  headers={'Content-Type': 'application/json', 'X-API-Key': key})
    with urlopen(req, timeout=360) as response:
        result = json.load(response)
    if result['status'] != 'completed':
        raise RuntimeError(str(result.get('error','consulta indisponível'))[:240])
    data = result['data']
    if data.get('rows_truncated') or len(data['rows']) >= 50001:
        raise RuntimeError('Consulta incompleta')
    return [dict(zip([c['name'] for c in data['cols']], row)) for row in data['rows']]


def preparar(inicio, fim, destino):
    if inicio > fim:
        raise ValueError('Período inválido')
    data = {'inicio': inicio.isoformat(), 'fim': fim.isoformat()}
    for nome in ('contas', 'eventos'):
        sql = (HERE / (nome + '.sql')).read_text().format(inicio=inicio.isoformat(), fim=fim.isoformat())
        data[nome] = consultar(sql)
        print(nome, len(data[nome]), flush=True)
        keys = ('conta','dia') if nome=='contas' else ('conta','dia','id','produto')
        if len({tuple(row[k] for k in keys) for row in data[nome]}) != len(data[nome]):
            raise ValueError('Chaves duplicadas em '+nome)
    if not data['contas']:
        raise RuntimeError('Sem cobertura de contas')
    data['gerado'] = datetime.now(timezone.utc).isoformat()
    destino.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with NamedTemporaryFile('w', dir=destino.parent, delete=False) as temp:
        json.dump(data, temp, ensure_ascii=False, allow_nan=False)
    os.replace(temp.name, destino)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inicio', type=date.fromisoformat)
    parser.add_argument('fim', type=date.fromisoformat)
    parser.add_argument('--destino', type=Path, default=SNAPSHOT)
    args=parser.parse_args()
    preparar(args.inicio,args.fim,args.destino)
