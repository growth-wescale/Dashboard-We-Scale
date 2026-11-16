import threading
import unittest
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FutureTimeout
from unittest.mock import Mock, patch

from app import GatewayError, Service


class CacheTests(unittest.TestCase):
 def setUp(self):
  self.access={'registrado':True,'ativo':True,'acesso_total':True}
  self.auth=Mock(side_effect=lambda path,*args: {'id':'user'} if path.startswith('/auth') else self.access)
  self.service=Service({'mode':'ouro'},connect=lambda:None,request_json=self.auth)
  self.payload={'mode':'ouro','rows':[{'id':'synthetic','amount':125.50}],'observed_at':'2026-11-01'}
  self.service.load=Mock(return_value=self.payload)
  self.body={'dataset':'leads','route':'/'}
  self.key=('leads','/')
  self.clock=patch('app.time.monotonic',return_value=1000)
  self.now=self.clock.start()
  self.addCleanup(self.clock.stop)

 def read(self):return self.service.read(self.body,'session')

 def test_warm_cache_keeps_payload_and_authenticates_each_request(self):
  self.assertEqual(self.read(),self.payload)
  self.now.return_value=1299
  self.assertEqual(self.read(),self.payload)
  self.service.load.assert_called_once_with('leads','/')
  self.assertEqual(self.auth.call_count,4)

 def test_revoked_access_cannot_read_cached_data(self):
  self.read();self.access['ativo']=False
  with self.assertRaises(GatewayError):self.read()
  self.service.load.assert_called_once()

 def test_other_brand_and_sales_do_not_use_warm_marketing_cache(self):
  self.read()
  self.access.update(acesso_total=False,permissoes=['aba.visao-geral'],marcas=['inpot'])
  self.assertEqual(self.read(),{'mode':'legacy'})
  self.access['acesso_total']=True
  self.assertEqual(self.service.read({'dataset':'cycles','route':'/funil-vendas'},'session'),{'mode':'legacy'})
  self.service.load.assert_called_once()

 def test_route_and_dataset_are_isolated(self):
  self.read()
  self.service.read({'dataset':'leads','route':'/marca'},'session')
  self.service.read({'dataset':'media','route':'/'},'session')
  self.assertEqual(self.service.load.call_count,3)
  self.assertEqual(set(self.service.cache),{self.key,('leads','/marca'),('media','/')})

 def test_simultaneous_reads_share_one_database_load(self):
  started=threading.Event();release=threading.Event();joined=threading.Event()
  class ObservedFuture(Future):
   def result(self,timeout=None):joined.set();return super().result(timeout)
  def load(*args):
   started.set()
   if not release.wait(3):raise AssertionError('test owner not released')
   return self.payload
  self.service.load.side_effect=load
  with patch('app.Future',ObservedFuture),ThreadPoolExecutor(2) as pool:
   first=pool.submit(self.read)
   try:
    self.assertTrue(started.wait(2))
    second=pool.submit(self.read)
    self.assertTrue(joined.wait(2))
   finally:release.set()
   self.assertEqual(first.result(2),second.result(2))
  self.service.load.assert_called_once()
  self.assertEqual(self.service.inflight,{})

 def test_shared_failure_can_recover_without_caching_error(self):
  started=threading.Event();release=threading.Event();joined=threading.Event()
  class ObservedFuture(Future):
   def result(self,timeout=None):joined.set();return super().result(timeout)
  def load(*args):
   started.set();release.wait(3)
   raise GatewayError(503,'source_unavailable')
  self.service.load.side_effect=load
  with patch('app.Future',ObservedFuture),ThreadPoolExecutor(2) as pool:
   first=pool.submit(self.read)
   try:
    self.assertTrue(started.wait(2));second=pool.submit(self.read)
    self.assertTrue(joined.wait(2))
   finally:release.set()
   for task in (first,second):
    with self.assertRaises(GatewayError):task.result(2)
  self.assertEqual(self.service.cache,{})
  self.assertEqual(self.service.inflight,{})
  with self.assertRaises(GatewayError):self.read()
  self.service.load.assert_called_once()
  self.now.return_value=1015
  self.service.load.side_effect=None
  self.assertEqual(self.read(),self.payload)
  self.assertEqual(self.service.load.call_count,2)

 def test_failed_renewal_does_not_extend_old_data_validity(self):
  self.read();self.now.return_value=1180
  self.service.load.side_effect=GatewayError(503,'source_unavailable')
  with self.assertRaises(GatewayError):self.service.refresh(self.key)
  self.assertEqual(self.read(),self.payload)
  self.assertEqual(self.service.cache[self.key][0],1000)
  self.now.return_value=1301
  with self.assertRaises(GatewayError):self.read()
  self.assertEqual(self.service.cache[self.key][0],1000)

 def test_successful_renewal_replaces_data_and_retains_source_timestamp(self):
  self.read();self.now.return_value=1180
  updated={'mode':'ouro','rows':[{'id':'synthetic','amount':130}],'observed_at':'2026-11-02'}
  self.service.load.return_value=updated
  self.service.refresh(self.key)
  self.assertEqual(self.read(),updated)
  self.assertEqual(self.service.cache[self.key][0],1180)

 def test_expired_read_refreshes_synchronously(self):
  self.read();self.now.return_value=1301
  self.assertEqual(self.read(),self.payload)
  self.assertEqual(self.service.load.call_count,2)

 def test_background_renews_only_due_keys_and_survives_failure(self):
  self.read();self.service.cache[('media','/')]=(1100,self.payload)
  self.now.return_value=1180
  self.service.load.side_effect=GatewayError(503,'source_unavailable')
  class StopLoop(BaseException):pass
  with patch('app.time.sleep',side_effect=[None,StopLoop()]):
   with self.assertRaises(StopLoop):self.service.maintain()
  self.assertEqual(self.service.load.call_count,2)
  self.service.load.assert_called_with(*self.key)
  self.assertEqual(self.read(),self.payload)

 def test_waiter_timeout_does_not_cancel_the_original_query(self):
  pending=Future();self.service.inflight[self.key]=pending
  with patch.object(pending,'result',side_effect=FutureTimeout):
   with self.assertRaises(GatewayError):self.read()
  self.service.load.assert_not_called()
  self.assertFalse(pending.cancelled())
  self.assertIs(self.service.inflight[self.key],pending)


if __name__=='__main__':unittest.main()
