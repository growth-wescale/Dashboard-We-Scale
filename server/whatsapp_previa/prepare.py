"""Gera uma fotografia privada de agregados para a prévia local autenticada."""
import argparse
from collections import defaultdict
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


def consolidar_modelos(rows):
    """Produtos sobrepostos só fornecem uma medição por conta/modelo/dia UTC."""
    groups = defaultdict(list)
    for row in rows:
        groups[row['conta'], row['id'], row['dia']].append(row)
    eventos = []
    classificados = defaultdict(int)
    for (conta, _, dia), series in sorted(groups.items()):
        produtos = {r['produto'] for r in series}
        if len(produtos) != len(series):
            raise ValueError('Série de produto repetida')
        if len({(r['marca'], r['modelo'], r['evento']) for r in series}) != 1:
            continue
        row = dict(series[0])
        row['produto'] = ' / '.join(sorted(produtos))
        row['desatualizado'] = any(r['desatualizado'] for r in series)
        for campo in ('enviados','entregues','lidos','projecao'):
            valores = {r[campo] for r in series}
            row[campo] = valores.pop() if len(valores) == 1 and not row['desatualizado'] else None
        if row['entregues'] is None:
            row['projecao'] = None
        if row['enviados'] is not None:
            if type(row['enviados']) is not int or row['enviados'] < 0:
                raise ValueError('Quantidade de envios inválida')
            tipo = 'rotina' if row['evento'] == 'rotina' else 'evento'
            classificados[conta, row['marca'], dia, tipo] += row['enviados']
        if row['evento'] != 'rotina':
            eventos.append(row)
    finalidades = [dict(conta=c,marca=m,dia=d,tipo=t,enviados=v)
                   for (c,m,d,t), v in sorted(classificados.items()) if v > 0]
    return eventos, finalidades


def abrir_lotes(lotes):
    rows = []
    for lote in lotes:
        series = lote['series']
        if isinstance(series, str):
            series = json.loads(series)
        if not isinstance(series, list) or len(series) != lote['quantidade']:
            raise ValueError('Lote de modelos incompleto')
        rows.extend(dict(s, conta=lote['conta'], dia=lote['dia']) for s in series)
    return rows


def preparar(inicio, fim, destino):
    if inicio > fim:
        raise ValueError('Período inválido')
    data = {'inicio': inicio.isoformat(), 'fim': fim.isoformat(), 'versao': 2}
    for nome in ('contas', 'eventos'):
        sql = (HERE / (nome + '.sql')).read_text().format(inicio=inicio.isoformat(), fim=fim.isoformat())
        data[nome] = consultar(sql)
        if nome == 'eventos':
            data[nome] = abrir_lotes(data[nome])
        print(nome, len(data[nome]), flush=True)
        keys = ('conta','dia') if nome=='contas' else ('conta','dia','id','produto')
        if len({tuple(row[k] for k in keys) for row in data[nome]}) != len(data[nome]):
            raise ValueError('Chaves duplicadas em '+nome)
    if not data['contas']:
        raise RuntimeError('Sem cobertura de contas')
    data['eventos'], data['finalidades'] = consolidar_modelos(data['eventos'])
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
