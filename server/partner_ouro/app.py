"""Gateway Partner: consultas fixas à ouro, sessão e permissões vivas do dashboard.
Sem SQL/tabela enviados pelo navegador; sem chave administrativa de Metabase.
"""
from __future__ import annotations
import datetime as dt
import decimal
import json
import os
import threading
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONTRACT = 'scale_partner_dashboard_v1'
ROUTES = {
 '/': 'aba.visao-geral', '/marca': 'aba.saude-marca', '/sop-marketing': 'aba.sop-marketing',
 '/funil-vendas': 'aba.visao-macro', '/performance-vendas': 'aba.performance',
 '/analise-perda': 'aba.analise-perda', '/okrs': 'aba.okrs',
 '/gp-setembro': 'aba.campanha-metas', '/gp-setembro/tv': 'aba.campanha-metas',
 '/linha-do-tempo': 'aba.linha-do-tempo', '/copa-b2b': 'aba.okrs',
 '/metas': 'aba.metas', '/distribuicao-leads': 'aba.distribuicao',
 '/analise-objecoes': 'aba.analise-objecoes', '/acessos': 'acao.usuarios-gerenciar',
}
ROUTE_DATASETS = {
 '/': {'cycles','legacyCycles','leads','media'}, '/marca': {'cycles','legacyCycles','leads','media'},
 '/sop-marketing': {'cycles','legacyCycles','leads','media','passages'},
 '/funil-vendas': {'cycles','passages','media'}, '/performance-vendas': {'cycles','passages','media','compatCycles'},
 '/analise-perda': {'cycles','passages','media'}, '/okrs': {'cycles','media','leads'},
 '/gp-setembro': {'cycles','media','leads'}, '/gp-setembro/tv': {'cycles','media','leads'},
 '/linha-do-tempo': {'cycles'}, '/copa-b2b': {'cycles','legacyCycles','media','leads'},
 '/metas': {'cycles'}, '/distribuicao-leads': {'cycles'}, '/analise-objecoes': {'cycles'}, '/acessos': {'cycles'},
}
DATASETS = {
 'cycles': 'SELECT * FROM ouro.vw_scale_partner_dashboard_ciclos ORDER BY id_lead,ciclo',
 'legacyCycles': 'SELECT * FROM ouro.vw_scale_partner_dashboard_ciclos WHERE eh_ciclo_atual ORDER BY id_lead,ciclo',
 'compatCycles': 'SELECT * FROM ouro.vw_scale_partner_dashboard_ciclos WHERE eh_ciclo_atual ORDER BY id_lead,ciclo',
 'passages': 'SELECT p.*,c.origem_comercial FROM ouro.vw_scale_partner_passagens p JOIN ouro.vw_scale_partner_dashboard_ciclos c ON c.id_lead=p.id_deal AND c.ciclo=p.ciclo ORDER BY p.data_evento_em,p.passagem_key',
 'leads': 'SELECT * FROM ouro.vw_scale_partner_mql_comercial ORDER BY dia DESC,id',
 'media': 'SELECT * FROM ouro.vw_scale_partner_dashboard_midia ORDER BY dia DESC,id',
 'tasks': 'SELECT * FROM ouro.vw_scale_partner_dashboard_tarefas ORDER BY deal_id,task_id',
 'timeline': 'SELECT * FROM ouro.vw_scale_partner_dashboard_timeline ORDER BY id_deal,data_evento,id_evento',
 # MeetRox não existe no contrato ouro atual. Nunca substituir ausência por zero.
 'meetings': None, 'closerMeetings': None,
}
CYCLE_FIELDS = '''id_lead ciclo eh_reciclagem eh_ciclo_atual marca nome_funil etapa_funil id_etapa_atual status_atual
 nome_sdr nome_closer nome_negociacao fonte_macro sub_fonte sub_fonte_crm utm_source utm_medium utm_campaign utm_term utm_content
 valor_contrato quantidade_unidades valor_produto motivo_perda data_criacao_negociacao data_criacao_original
 data_novo_mql data_tentando_contato data_contato_efetivo data_interesse_reuniao data_conexao data_agendamento_reuniao_sql
 data_reuniao_realizada data_no_show data_sal data_oportunidade data_comite data_pre_contrato data_venda data_perdido origem_comercial'''.split()
LEAD_FIELDS = 'id dia marca nome email telefone uf cidade utm_source utm_medium utm_campaign formulario dados_extras row_hash criado_em'.split()
MEDIA_FIELDS = 'id dia marca canal campanha conjunto anuncio spend_brl impressoes cliques_link lpv cpm cpc leads video_p50 video_thruplay criado_em'.split()
TASK_FIELDS = 'task_id subject notes type done status_calc prazo done_date user_name deal_id'.split()
TIMELINE_FIELDS = 'id_evento id_deal tipo_evento nome_funil id_etapa nome_etapa nome_etapa_anterior responsavel valor_anterior valor_novo data_evento motivo_perda anotacao_perda'.split()

class GatewayError(Exception):
 def __init__(self, status, code): self.status, self.code = status, code

def authorization(settings, token, route, request_json):
 if not token or len(token)>8192: raise GatewayError(401,'session_required')
 if route.startswith('/linha-do-tempo/'):
  tail=route.removeprefix('/linha-do-tempo/')
  if len(tail)!=24 or any(c not in '0123456789abcdef' for c in tail): raise GatewayError(400,'invalid_route')
  key='aba.linha-do-tempo'
 else: key=ROUTES.get(route)
 if key is None: raise GatewayError(403,'route_not_allowed')
 # getUser valida o bearer no Auth; RPC reconsulta usuário ativo/papel/marcas.
 user=request_json('/auth/v1/user',token,None)
 if not isinstance(user,dict) or not user.get('id') or user.get('is_anonymous') is True: raise GatewayError(401,'invalid_session')
 access=request_json('/rest/v1/rpc/minhas_permissoes',token,{})
 if not isinstance(access,dict) or access.get('registrado') is not True or access.get('ativo') is not True: raise GatewayError(403,'inactive_user')
 all_access=access.get('acesso_total') is True
 brands=access.get('marcas') or ([access['marca']] if access.get('marca') else [])
 if not isinstance(brands,list) or any(not isinstance(x,str) for x in brands): raise GatewayError(403,'invalid_scope')
 if not all_access and (key not in access.get('permissoes',[]) or brands and key not in ('aba.visao-geral','aba.saude-marca','aba.sop-marketing','aba.visao-macro','aba.performance','aba.analise-perda','aba.linha-do-tempo')): raise GatewayError(403,'tab_not_allowed')
 return all_access or not brands or 'we-scale' in brands

def serialize(v):
 if isinstance(v,decimal.Decimal): return float(v)
 if isinstance(v,(dt.date,dt.datetime,dt.time)): return v.isoformat()
 raise TypeError('unsupported_response_type')

def mapped(dataset, rows):
 out=[]
 for source in rows:
  r=dict(source)
  if dataset in ('cycles','legacyCycles','compatCycles'):
   r={k:r.get(k) for k in CYCLE_FIELDS};r['marca']='We Scale'
   if dataset!='cycles':
    r.update(funil=r['nome_funil'],fonte=r['utm_source'])
   if dataset=='legacyCycles':
    r.update(data_mql=r['data_novo_mql'],data_sql=r['data_agendamento_reuniao_sql'],data_diagnostico=r['data_reuniao_realizada'])
  elif dataset=='passages':
   r={k:r.get(k) for k in ('id_deal','dia','etapa_canonica','id_etapa','nome_funil','ciclo','marca_deal','origem_comercial')}
   r.update(marca_deal='We Scale',rn_deal_etapa_mes=1)
  elif dataset=='leads': r={k:r.get(k) for k in LEAD_FIELDS}
  elif dataset=='media': r={k:r.get(k) for k in MEDIA_FIELDS}
  elif dataset=='tasks':
   r={k:r.get(k) for k in TASK_FIELDS}
   due,finished=r.get('prazo'),r.get('done_date')
   if r.get('done') and due and finished:r['status_calc']='concluida_atrasada' if finished>due else 'concluida_no_prazo'
   elif not r.get('done') and due:r['status_calc']='atrasada' if due<dt.datetime.now(dt.timezone.utc) else 'em_aberto'
  elif dataset=='timeline': r={k:r.get(k) for k in TIMELINE_FIELDS}
  r={k:(v.astimezone(ZoneInfo('America/Sao_Paulo')).isoformat() if isinstance(v,dt.datetime) else v) for k,v in r.items()}
  out.append(r)
 return out

class Service:
 def __init__(self,settings,connect=None,request_json=None):
  self.settings=settings;self.slots=threading.BoundedSemaphore(3)
  if connect is None:
   import psycopg
   from psycopg.rows import dict_row
   pg=settings['postgres']
   if pg.get('dbname')!='oralunic_dw' or pg.get('user')!='dashboard_scale_partner_ro' or pg.get('sslmode')!='verify-full' or not pg.get('sslrootcert'): raise ValueError('unsafe_connection')
   self.connect=lambda: psycopg.connect(**pg,row_factory=dict_row,connect_timeout=5,application_name='dashboard_partner_ouro',
    options='-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=1000 -c search_path=pg_catalog -c timezone=UTC')
  else:self.connect=connect
  self.request_json=request_json or self.auth_request
 def auth_request(self,path,token,body):
  headers={'apikey':self.settings['supabase_anon_key'],'Authorization':'Bearer '+token,'Content-Type':'application/json'}
  req=urllib.request.Request(self.settings['supabase_url']+path,headers=headers,
   data=None if body is None else json.dumps(body).encode(),method='GET' if body is None else 'POST')
  try:
   with urllib.request.urlopen(req,timeout=10) as response:
    raw=response.read(1048577)
    if len(raw)>1048576:raise GatewayError(503,'auth_response_too_large')
    return json.loads(raw)
  except urllib.error.HTTPError as error:
   raise GatewayError(401 if error.code in(401,403) else 503,'auth_unavailable') from None
  except (OSError,ValueError):raise GatewayError(503,'auth_unavailable') from None
 def read(self,body,token):
  if not isinstance(body,dict) or set(body)!={'dataset','route'} or body['dataset'] not in DATASETS or not isinstance(body['route'],str):raise GatewayError(400,'invalid_request')
  detail=body['route'].startswith('/linha-do-tempo/')
  allowed={'cycles','timeline','tasks'} if detail else ROUTE_DATASETS.get(body['route'],set())
  if body['dataset'] not in allowed:raise GatewayError(403,'dataset_not_allowed_in_route')
  related=authorization(self.settings,token,body['route'],self.request_json)
  # A migração autorizada é somente Marketing. Clientes de Vendas permanecem nativos.
  if body['route'] not in ('/','/marca','/sop-marketing','/okrs','/copa-b2b'):return {'mode':'legacy'}
  if not related or self.settings.get('mode')=='legacy':return {'mode':'legacy'}
  dataset=body['dataset'];query=DATASETS[dataset]
  if query is None:raise GatewayError(409,'ouro_contract_missing')
  if not self.slots.acquire(timeout=10):raise GatewayError(429,'busy')
  try:
   with self.connect() as c:
    c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    role=c.execute("SELECT current_user u,(SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) unsafe").fetchone()
    if role['u']!='dashboard_scale_partner_ro' or role['unsafe']:raise GatewayError(503,'unsafe_role')
    ids=[r['id_lead'] for r in c.execute('SELECT id_lead FROM ouro.vw_scale_partner_dashboard_identidades ORDER BY id_lead')]
    if detail and body['route'].rsplit('/',1)[-1] not in ids:return {'mode':'legacy'}
    rows=c.execute(query+' LIMIT 50001').fetchall()
    if detail:
     target=body['route'].rsplit('/',1)[-1]
     rows=[r for r in rows if r.get('id_lead',r.get('id_deal',r.get('deal_id')))==target];ids=[target]
    if len(rows)>50000:raise GatewayError(503,'result_too_large')
    observed=c.execute('SELECT max(carregado_em) t FROM ouro.vw_scale_partner_dashboard_ciclos').fetchone()['t']
    if dataset=='leads' and any(not r.get('contato_id') or not(r.get('email') or r.get('telefone')) for r in rows):raise GatewayError(409,'commercial_identity_incomplete')
    if dataset=='media' and any(r.get('spend_brl') is None for r in rows):raise GatewayError(409,'media_amount_incomplete')
    for r in rows:
     brand=r.get('marca',r.get('marca_deal'))
     if brand is not None and brand not in ('We Scale','Scale Partner'):raise GatewayError(503,'scope_violation')
    warnings=['Histórico ouro observado; snapshots manuais identificados permanecem históricos.']
    if dataset=='timeline':warnings.append('Mudanças de campo sem contrato histórico não são inferidas.')
    return {'mode':'ouro','contract':CONTRACT,'dataset':dataset,'rows':mapped(dataset,rows),'partner_ids':ids,'observed_at':observed,'warnings':warnings}
  finally:self.slots.release()

class Handler(BaseHTTPRequestHandler):
 service=None
 def log_message(self,*args):pass  # Nenhum bearer, contato, query ou payload no log.
 def respond(self,status,body):
  raw=json.dumps(body,default=serialize,ensure_ascii=False,allow_nan=False).encode()
  self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store')
  self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
 def do_GET(self):
  if self.path=='/health':self.respond(200,{'status':'up','service':'partner-ouro'})
  else:self.respond(404,{'code':'not_found'})
 def do_POST(self):
  if self.path!='/api/partner-ouro/v1/read':self.respond(404,{'code':'not_found'});return
  try:
   n=int(self.headers.get('Content-Length','0'))
   if not 0<n<=4096:raise GatewayError(413,'body_too_large')
   auth=self.headers.get('Authorization','')
   if not auth.startswith('Bearer '):raise GatewayError(401,'session_required')
   body=json.loads(self.rfile.read(n));result=self.service.read(body,auth[7:]);self.respond(200,result)
  except GatewayError as error:self.respond(error.status,{'code':error.code})
  except (ValueError,TypeError):self.respond(400,{'code':'invalid_request'})
  except Exception:self.respond(503,{'code':'source_unavailable'})

def main():
 settings=json.loads(Path(os.environ.get('PARTNER_OURO_CONFIG','/run/partner/config.json')).read_text())
 Handler.service=Service(settings);ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()
if __name__=='__main__':main()
