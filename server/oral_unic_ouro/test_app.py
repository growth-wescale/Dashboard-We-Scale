import unittest
from unittest.mock import patch
from app import Service, GatewayError, maintain_cache, prepare_deals

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
  if 'current_user' in query: return Result({'u':'dashboard_oral_unic_ro','unsafe':False})
  return Result(self.rows)

class Tests(unittest.TestCase):
 def service(self, rows, mode='ouro'):
  c=Connection(rows)
  return Service({'mode':mode},connect=lambda:c,request_json=auth),c
 def test_reads_scoped_data_in_readonly_transaction(self):
  s,c=self.service([{'id':'a','dia':'2026-10-10','marca':'Oral Unic','dados_extras':{},'contato_id':'c'}])
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
 def test_missing_commercial_identity_is_not_silently_counted(self):
  s,c=self.service([{'id':'a','dia':'2026-10-10','marca':'Oral Unic','dados_extras':{'classification_source':'deal_criado_crm','id_deal':'deal-b','data_criacao_crm':'2026-10-30T12:00:00Z'}}])
  result=s.read({'dataset':'leads','route':'/'},'token')
  self.assertEqual(result['rows'],[])
  self.assertEqual(result['warnings'],[{'code':'accepted_missing_contact','count':1}])
 def test_pending_identity_does_not_modify_valid_rows_or_refresh(self):
  valid={'id':'a','dia':'2026-10-10','marca':'Oral Unic','contato_id':'c','email':'example@example.test','dados_extras':{'classification_source':'deal_criado_crm','original':'preserved','id_deal':'deal-a','data_criacao_crm':'2026-10-10T12:00:00Z'}}
  pending={'id':'b','dia':'2026-10-30','marca':'Oral Unic','dados_extras':{'classification_source':'deal_criado_crm','id_deal':'deal-b','data_criacao_crm':'2026-10-30T12:00:00Z'}}
  s,c=self.service([valid,pending])
  with patch('app.time.monotonic',return_value=100):s.refresh_dataset('leads')
  with patch('app.time.monotonic',return_value=340):s.refresh_dataset('leads')
  with patch('app.time.monotonic',return_value=401):result=s.read({'dataset':'leads','route':'/'},'token')
  self.assertEqual(result['rows'],[valid])
  self.assertIs(result['rows'][0],valid)
  self.assertEqual(c.rows,[valid,pending])
  self.assertEqual(result['warnings'],[{'code':'accepted_missing_contact','count':1}])
 def test_pending_identity_cannot_hide_scope_or_duplicate_errors(self):
  pending={'id':'a','dia':'2026-10-30','marca':'Oral Unic','dados_extras':{'classification_source':'deal_criado_crm','id_deal':'deal-b','data_criacao_crm':'2026-10-30T12:00:00Z'}}
  for rows,code in [([pending,pending],'duplicate_id'),([dict(pending,marca='Outra')],'scope_violation'),([dict(pending,dia='2026-11-01')],'scope_violation')]:
   s,c=self.service(rows)
   with self.assertRaises(GatewayError) as error:s.read({'dataset':'leads','route':'/'},'token')
   self.assertEqual(error.exception.code,code)
 def test_other_brands_and_months_are_rejected(self):
  for row in [{'id':'a','dia':'2026-10-10','marca':'We Scale'}, {'id':'a','dia':'2026-09-10','marca':'Oral Unic'}]:
   s,c=self.service([row])
   with self.assertRaises(GatewayError):s.read({'dataset':'leads','route':'/'},'token')
 def test_failed_lead_refresh_retries_without_delaying_media_or_extending_cache_age(self):
  s,_=self.service([])
  s.cache={'leads':(0,{}),'media':(5,{})}
  now=[0]; attempts=[]
  def sleep(seconds): now[0]+=seconds
  def refresh(dataset):
   attempts.append((dataset,now[0]))
   if len(attempts)==1:
    now[0]+=45
    raise TimeoutError()
   if len(attempts)==4: raise SystemExit()
  with patch('app.time.monotonic',side_effect=lambda:now[0]), patch('app.time.sleep',side_effect=sleep), patch.object(s,'refresh_dataset',side_effect=refresh):
   with self.assertRaises(SystemExit):maintain_cache(s)
  self.assertEqual(attempts[:3],[('leads',180),('media',225),('leads',240)])
  self.assertEqual(s.cache['leads'][0],0)
 def test_cache_preserves_rows_and_rechecks_authorization(self):
  s,c=self.service([{'id':'a','dia':'2026-10-10','marca':'Oral Unic','dados_extras':{}}])
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
   {'registrado':True,'ativo':True,'permissoes':['aba.okrs'],'marcas':['oral-unic']}]:
   s.request_json=lambda path,token,body: {'id':'user'} if path.endswith('/user') else access
   with self.assertRaises(GatewayError) as e:s.read({'dataset':'leads','route':'/'},'token')
   self.assertEqual(e.exception.status,403)
  self.assertEqual(c.queries,[])
 def test_shared_media_account_rejects_legacy_and_community(self):
  for campaign in ['120248676604920752','120248355011530752']:
   s,c=self.service([{'id':'a','dia':'2026-10-10','marca':'Oral Unic','canal':'meta','conta_id':'24763396173316651','campanha_id':campaign,'spend_brl':1,'moeda':'BRL'}])
   with self.assertRaises(GatewayError) as e:s.read({'dataset':'media','route':'/'},'token')
   self.assertEqual(e.exception.code,'campaign_scope_violation')
 def test_scoped_media_preserves_exact_amount(self):
  s,c=self.service([{'id':'a','dia':'2026-10-10','marca':'Oral Unic','canal':'google','conta_id':'9733883995','campanha_id':'23324303426','spend_brl':2660.488559,'moeda':'BRL'}])
  self.assertEqual(s.read({'dataset':'media','route':'/'},'token')['rows'][0]['spend_brl'],2660.488559)
 def test_no_token(self):
  s,c=self.service([])
  with self.assertRaises(GatewayError) as e:s.read({'dataset':'leads','route':'/'},'')
  self.assertEqual(e.exception.status,401)
  self.assertEqual(c.queries,[])

 def test_deals_count_unlinked_and_shared_contact_once_per_id(self):
  def row(deal,created='2026-10-20T12:00:00Z'):
   return {'id':deal,'marca':'Oral Unic','dia':'2026-10-20','email':None,'contato_id':None,'dados_extras':{'classification_source':'deal_criado_crm','id_deal':deal,'data_criacao_crm':created,'segmento':'oral-unic'}}
  rows=[row('a'),row('b'),row('a'),row('utc-october','2026-10-01T01:00:00Z'),row('brasilia-october','2026-11-01T01:00:00Z')]
  result=prepare_deals(rows)
  self.assertEqual([r['dados_extras']['id_deal'] for r in result],['a','b','brasilia-october'])
  self.assertTrue(all(r['email'] is None and r['contato_id'] is None for r in result))
  self.assertEqual(result[-1]['dia'],'2026-10-31')
  self.assertNotIn('metric_grain',rows[0]['dados_extras'])
 def test_invalid_deal_identity_or_creation_fails_closed(self):
  for extra in [{},{'id_deal':'a'},{'id_deal':'a','data_criacao_crm':'2026-10-10T12:00:00'}]:
   with self.assertRaises(GatewayError):prepare_deals([{'dados_extras':{'classification_source':'deal_criado_crm',**extra}}])

if __name__=='__main__':unittest.main()
