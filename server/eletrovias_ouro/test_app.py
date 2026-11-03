import unittest
from unittest.mock import patch
from app import Service, GatewayError

def auth(path, token, body):
 return {'id':'user'} if path.endswith('/user') else {'registrado':True,'ativo':True,'acesso_total':True}

class Result:
 def __init__(self, value): self.value=value
 def fetchone(self): return self.value
 def fetchall(self): return self.value

class Connection:
 def __init__(self, rows): self.rows=rows; self.queries=[]
 def __enter__(self): return self
 def __exit__(self,*args): pass
 def execute(self, query):
  self.queries.append(query)
  if 'current_user' in query: return Result({'u':'dashboard_eletrovias_ro','unsafe':False})
  return Result(self.rows)

class Tests(unittest.TestCase):
 def service(self, rows, mode='ouro'):
  c=Connection(rows)
  return Service({'mode':mode},connect=lambda:c,request_json=auth),c
 def test_reads_scoped_data_in_readonly_transaction(self):
  s,c=self.service([{'id':'a','dia':'2026-10-10','marca':'Eletrovias','dados_extras':{},'contato_id':'c'}])
  r=s.read({'dataset':'leads','route':'/marca'},'token')
  self.assertEqual(len(r['rows']),1)
  self.assertIn('READ ONLY',c.queries[0])
  self.assertTrue(all('ouro.' in q for q in c.queries if 'SELECT *' in q))
 def test_sales_and_arbitrary_dataset_are_rejected(self):
  s,c=self.service([])
  for body in [{'dataset':'leads','route':'/funil-vendas'}, {'dataset':'crm','route':'/marca'}]:
   with self.assertRaises(GatewayError): s.read(body,'token')
  self.assertEqual(c.queries,[])
 def test_legacy_never_connects(self):
  s,c=self.service([],mode='legacy')
  self.assertEqual(s.read({'dataset':'leads','route':'/'},'token'),{'mode':'legacy'})
  self.assertEqual(c.queries,[])
 def test_new_deal_without_contact_is_counted_not_blocking(self):
  # Negócio criado no CRM sem contato (ex.: Closer cria à mão) não vira pessoa,
  # mas também não pode derrubar a leitura inteira da marca.
  s,c=self.service([{'id':'a','dia':'2026-10-10','marca':'Eletrovias','dados_extras':{'classification_source':'deal_criado_crm','id_deal':'novo-sem-contato'}}])
  r=s.read({'dataset':'leads','route':'/'},'token')
  self.assertEqual(r['rows'],[])
  self.assertEqual(r['warnings'],[{'code':'accepted_missing_contact','count':1}])
 def test_accepted_pending_contact_does_not_create_a_person_or_drop_other_rows(self):
  pending={'id':'pending','dia':'2026-10-15','marca':'Eletrovias','dados_extras':{'classification_source':'deal_criado_crm','lead_type':'MQL','id_deal':'6ad18c51de18d10020db5411'}}
  identified={'id':'real','dia':'2026-10-16','marca':'Eletrovias','contato_id':'contact','email':'real@example.test','dados_extras':{'classification_source':'deal_criado_crm','lead_type':'MQL'}}
  unknown={'id':'capture','dia':'2026-10-17','marca':'Eletrovias','dados_extras':{'lead_type':None,'capital':'200000'}}
  rows=[pending,identified,unknown]
  s,c=self.service(rows)
  result=s.read({'dataset':'leads','route':'/'},'token')
  self.assertEqual(result['rows'],[identified,unknown])
  self.assertEqual(result['warnings'],[{'code':'accepted_missing_contact','count':1}])
  self.assertEqual(len(rows),3)
  self.assertIsNone(result['rows'][1]['dados_extras']['lead_type'])
 def test_accepted_deal_enters_automatically_when_source_supplies_real_identity(self):
  row={'id':'pending','dia':'2026-10-15','marca':'Eletrovias','dados_extras':{'classification_source':'deal_criado_crm','lead_type':'MQL','id_deal':'6ad18c51de18d10020db5411'}}
  s,c=self.service([row])
  self.assertEqual(s.read({'dataset':'leads','route':'/'},'token')['rows'],[])
  row.update({'contato_id':'real-contact','telefone':'5511999999999'})
  result=s.refresh_dataset('leads')
  self.assertEqual(result['rows'],[row])
  self.assertEqual(result['warnings'],[])
 def test_other_brands_and_months_are_rejected(self):
  for row in [{'id':'a','dia':'2026-10-10','marca':'We Scale'}, {'id':'a','dia':'2026-09-10','marca':'Eletrovias'}]:
   s,c=self.service([row])
   with self.assertRaises(GatewayError):s.read({'dataset':'leads','route':'/'},'token')
 def test_cache_preserves_rows_and_rechecks_authorization(self):
  s,c=self.service([{'id':'a','dia':'2026-10-10','marca':'Eletrovias','dados_extras':{}}])
  first=s.read({'dataset':'leads','route':'/'},'token')
  queries=len(c.queries)
  self.assertEqual(s.read({'dataset':'leads','route':'/marca'},'token'),first)
  self.assertEqual(len(c.queries),queries)
  s.request_json=lambda path,token,body: {'id':'user'} if path.endswith('/user') else {'registrado':True,'ativo':False}
  with self.assertRaises(GatewayError) as e:s.read({'dataset':'leads','route':'/'},'token')
  self.assertEqual(e.exception.status,403)
 def test_expired_cache_fails_closed_without_database_retry(self):
  s,c=self.service([])
  with patch('app.time.monotonic',return_value=100):s.refresh_dataset('leads')
  queries=len(c.queries)
  with patch('app.time.monotonic',return_value=401):
   with self.assertRaises(GatewayError) as e:s.read({'dataset':'leads','route':'/'},'token')
  self.assertEqual(e.exception.code,'source_refresh_pending')
  self.assertEqual(len(c.queries),queries)
 def test_permissions_cannot_read_other_brands_or_tabs(self):
  s,c=self.service([])
  for access in [
   {'registrado':True,'ativo':True,'permissoes':['aba.visao-geral'],'marcas':['inpot']},
   {'registrado':True,'ativo':True,'permissoes':['aba.okrs'],'marcas':['eletrovias']}]:
   s.request_json=lambda path,token,body: {'id':'user'} if path.endswith('/user') else access
   with self.assertRaises(GatewayError) as e:s.read({'dataset':'leads','route':'/'},'token')
   self.assertEqual(e.exception.status,403)
  self.assertEqual(c.queries,[])
 def test_other_campaigns_are_rejected(self):
  for campaign in ['120248676604920752','120248355011530752']:
   s,c=self.service([{'id':'a','dia':'2026-10-10','marca':'Eletrovias','canal':'meta','conta_id':'24763396173316651','campanha_id':campaign,'spend_brl':1,'moeda':'BRL'}])
   with self.assertRaises(GatewayError) as e:s.read({'dataset':'media','route':'/'},'token')
   self.assertEqual(e.exception.code,'campaign_scope_violation')
 def test_scoped_media_preserves_exact_amount(self):
  s,c=self.service([{'id':'a','dia':'2026-10-10','marca':'Eletrovias','canal':'google','conta_id':'2319926905','campanha_id':'23778217190','spend_brl':2660.488559,'moeda':'BRL'}])
  self.assertEqual(s.read({'dataset':'media','route':'/'},'token')['rows'][0]['spend_brl'],2660.488559)
 def test_no_token(self):
  s,c=self.service([])
  with self.assertRaises(GatewayError) as e:s.read({'dataset':'leads','route':'/'},'')
  self.assertEqual(e.exception.status,401)
  self.assertEqual(c.queries,[])

if __name__=='__main__':unittest.main()

class DealTests(unittest.TestCase):
 def rows(self):
  return [dict(conta_id='wescale_principal_crm',negocio_id=i,marca='Eletrovias',
   data_criacao_original=date,elegivel_kpi=eligible,nome_funil=funnel,status_atual=status)
   for i,date,eligible,funnel,status in [
    ('start','2026-10-01T01:00:00+00:00',True,'SDR','Aberto'),
    ('sdr','2026-10-10T12:00:00+00:00',True,'SDR','Perdido'),
    ('closer','2026-10-10T12:00:00+00:00',True,'Closer','Ganho'),
    ('6adbb24ffe6c3900293048dc','2026-10-10T12:00:00+00:00',False,'SDR','Perdido'),
    ('end','2026-11-01T01:00:00+00:00',True,'Closer','Aberto')]]
 def test_default_never_reads_new_view(self):
  s=Service({'mode':'ouro'},connect=lambda:None,request_json=auth)
  self.assertNotIn('negocios',s.queries)
  with self.assertRaises(GatewayError):s.read({'dataset':'negocios','route':'/'},'token')
 def test_approved_brasilia_boundaries_and_only_three_explicit_tests(self):
  from app import prepare_deals
  source=self.rows()+[dict(self.rows()[1],negocio_id='other-ineligible',elegivel_kpi=False)]
  rows,_=prepare_deals(source)
  self.assertEqual([r['dados_extras']['id_deal'] for r in rows],['sdr','closer','end','other-ineligible'])
  self.assertTrue(all(r['email'] is None and r['nome'] is None for r in rows))
  self.assertTrue(all(r['utm_source'] is None for r in rows))
  self.assertEqual(rows[2]['dia'],'2026-10-31')
 def test_negocios_readonly_and_missing_contact_is_retained(self):
  c=Connection(self.rows())
  s=Service({'mode':'ouro','negocios_enabled':True},connect=lambda:c,request_json=auth)
  reply=s.read({'dataset':'negocios','route':'/sop-marketing'},'token')
  self.assertEqual(reply['contract'],'eletrovias_negocios_v1')
  self.assertEqual(len(reply['rows']),3)
  self.assertIn('READ ONLY',c.queries[0])
  self.assertIn('ouro.vw_eletrovias_dashboard_negocios',c.queries[-1])
 def test_duplicate_and_other_brand_cannot_enter(self):
  from app import prepare_deals
  for rows in [[self.rows()[0]]*2,[dict(self.rows()[0],marca='Oral Unic')],[dict(self.rows()[0],data_criacao_original='2026-10-10')]]:
   with self.assertRaises(GatewayError):prepare_deals(rows)
