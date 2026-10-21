import unittest
from app import authorization, GatewayError, mapped, Service
class SecurityTests(unittest.TestCase):
 def request(self,access,user=None):
  return lambda path,token,body: ({'id':'user'} if user is None else user) if path.startswith('/auth') else access
 def base(self,**extra):return dict(registrado=True,ativo=True,acesso_total=False,permissoes=['aba.visao-macro','aba.linha-do-tempo'],marcas=['we-scale'],**extra)
 def test_authorized(self):self.assertTrue(authorization({},'session','/funil-vendas',self.request(self.base())))
 def test_deactivated_and_anonymous(self):
  a=self.base();a['ativo']=False
  for access,user in [(a,None),(self.base(),{'id':'user','is_anonymous':True})]:
   with self.assertRaises(GatewayError):authorization({},'session','/funil-vendas',self.request(access,user))
 def test_route_and_brand(self):
  with self.assertRaises(GatewayError):authorization({},'session','/okrs',self.request(self.base()))
  a=self.base();a['marcas']=['inpot'];self.assertFalse(authorization({},'session','/funil-vendas',self.request(a)))
 def test_no_user_metadata_authorization(self):
  a={'registrado':False,'user_metadata':{'acesso_total':True}}
  with self.assertRaises(GatewayError):authorization({},'session','/funil-vendas',self.request(a))
 def test_idor_invalid_route(self):
  with self.assertRaises(GatewayError):authorization({},'session','/linha-do-tempo/../x',self.request(self.base()))
 def test_fixed_contract_no_sql(self):
  s=Service({'mode':'legacy'},connect=lambda:None,request_json=self.request(self.base()))
  for body in [{'dataset':'cycles','route':'/funil-vendas','sql':'DELETE'}, {'dataset':'prata.crm_contatos','route':'/funil-vendas'}]:
   with self.assertRaises(GatewayError):s.read(body,'session')
 def test_rollback_no_database(self):
  s=Service({'mode':'legacy'},connect=lambda:self.fail('must not connect'),request_json=self.request(self.base()))
  self.assertEqual(s.read({'dataset':'cycles','route':'/funil-vendas'},'session'),{'mode':'legacy'})
 def test_sales_never_reads_gold_even_when_enabled(self):
  for route in ['/funil-vendas','/performance-vendas','/analise-perda','/linha-do-tempo','/gp-setembro','/gp-setembro/tv']:
   access=self.base();access.update(acesso_total=True)
   s=Service({'mode':'ouro'},connect=lambda:self.fail('sales must not connect to gold'),request_json=self.request(access))
   self.assertEqual(s.read({'dataset':'cycles','route':route},'session'),{'mode':'legacy'})
 def test_payload_allowlist_and_sell_lock_preserved(self):
  r=mapped('cycles',[{'id_lead':'d','marca':'Scale Partner','status_atual':'Perdido','data_venda':'2026-10-20','payload':{'secret':1}}])[0]
  self.assertEqual(r['marca'],'We Scale');self.assertEqual(r['status_atual'],'Perdido');self.assertNotIn('payload',r)
if __name__=='__main__':unittest.main()
