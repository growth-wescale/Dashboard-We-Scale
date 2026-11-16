"""Cache coordination tests: real threads, deferred loads and controlled clock."""
import threading
import unittest
from concurrent.futures import Future, ThreadPoolExecutor
from unittest.mock import Mock, patch
from app import GatewayError, Service
from test_app import auth

class CacheTests(unittest.TestCase):
 def service(self):
  return Service({'mode':'ouro'}, connect=lambda:None, request_json=auth)

 def concurrent(self, failure=False):
  service=self.service();entered=threading.Event();joined=threading.Event();release=threading.Event()
  class ObservedFuture(Future):
   def result(self,*args,**kwargs):
    joined.set()
    return super().result(*args,**kwargs)
  value={'rows':[{'id':'synthetic'}]}
  def load(dataset):
   entered.set()
   if not release.wait(3):raise AssertionError('load not released')
   if failure:raise GatewayError(503,'source_unavailable')
   return value
  service.load_dataset=Mock(side_effect=load)
  def read():return service.read({'dataset':'leads','route':'/'},'token')
  with patch('app.Future',ObservedFuture),ThreadPoolExecutor(2) as pool:
   first=pool.submit(read)
   try:
    self.assertTrue(entered.wait(3));second=pool.submit(read)
    self.assertTrue(joined.wait(3))
   finally:release.set()
   if failure:
    for task in (first,second):
     with self.assertRaises(GatewayError):task.result(3)
    self.assertNotIn('leads',service.cache)
    with self.assertRaises(GatewayError):read()
   else:
    self.assertIs(first.result(3),value);self.assertIs(second.result(3),value)
  service.load_dataset.assert_called_once_with('leads')
  self.assertEqual(service.inflight,{})

 def test_simultaneous_cold_reads_share_one_query(self):self.concurrent()
 def test_simultaneous_failure_is_shared_and_backed_off(self):self.concurrent(True)

 def test_valid_cache_remains_available_during_background_refresh(self):
  s=self.service();old={'rows':['old']};new={'rows':['new']};s.cache['leads']=(100,old)
  entered=threading.Event();release=threading.Event()
  def load(dataset):
   entered.set();release.wait(3);return new
  s.load_dataset=load
  with patch('app.time.monotonic',return_value=280),ThreadPoolExecutor(1) as pool:
   task=pool.submit(s.refresh_dataset,'leads')
   try:
    self.assertTrue(entered.wait(3))
    self.assertIs(s.read({'dataset':'leads','route':'/'},'token'),old)
   finally:release.set()
   self.assertIs(task.result(3),new)
  self.assertEqual(s.cache['leads'],(280,new))

 def test_refresh_error_never_extends_expired_cache(self):
  s=self.service();old={'rows':['old']};s.cache['leads']=(100,old)
  s.load_dataset=Mock(side_effect=GatewayError(503,'source_unavailable'))
  with patch('app.time.monotonic',return_value=280):
   with self.assertRaises(GatewayError):s.refresh_dataset('leads')
   self.assertIs(s.read({'dataset':'leads','route':'/'},'token'),old)
  with patch('app.time.monotonic',return_value=401):
   with self.assertRaises(GatewayError):s.read({'dataset':'leads','route':'/'},'token')
  self.assertEqual(s.cache['leads'],(100,old))

 def test_expired_cache_recovers_on_demand_and_datasets_remain_distinct(self):
  s=self.service();s.cache['leads']=(0,{'rows':['old']})
  s.load_dataset=Mock(side_effect=lambda dataset:{'rows':[dataset]})
  with patch('app.time.monotonic',return_value=301):
   for dataset in ('leads','media'):
    self.assertEqual(s.read({'dataset':dataset,'route':'/'},'token'),{'rows':[dataset]})
  self.assertEqual(s.load_dataset.call_count,2)

 def test_failed_refresh_retries_only_after_backoff(self):
  s=self.service();s.load_dataset=Mock(side_effect=[GatewayError(503,'source_unavailable'),{'rows':[]}])
  with patch('app.time.monotonic',return_value=100):
   with self.assertRaises(GatewayError):s.refresh_dataset('leads')
  with patch('app.time.monotonic',return_value=114):
   with self.assertRaises(GatewayError):s.refresh_dataset('leads')
  with patch('app.time.monotonic',return_value=115):
   self.assertEqual(s.refresh_dataset('leads'),{'rows':[]})
  self.assertEqual(s.load_dataset.call_count,2)
  self.assertNotIn('leads',s.refresh_failed_at)

 def test_expired_reader_joins_background_refresh(self):
  s=self.service();old={'rows':['old']};new={'rows':['new']};s.cache['leads']=(0,old)
  entered=threading.Event();joined=threading.Event();release=threading.Event()
  class ObservedFuture(Future):
   def result(self,*args,**kwargs):
    joined.set();return super().result(*args,**kwargs)
  def load(dataset):
   entered.set();release.wait(3);return new
  s.load_dataset=Mock(side_effect=load)
  with patch('app.Future',ObservedFuture),patch('app.time.monotonic',return_value=301),ThreadPoolExecutor(2) as pool:
   background=pool.submit(s.refresh_dataset,'leads')
   try:
    self.assertTrue(entered.wait(3))
    reader=pool.submit(s.read,{'dataset':'leads','route':'/'},'token')
    self.assertTrue(joined.wait(3))
   finally:release.set()
   self.assertIs(background.result(3),new);self.assertIs(reader.result(3),new)
  s.load_dataset.assert_called_once_with('leads')

 def test_waiter_timeout_does_not_cancel_owner_or_serve_stale_data(self):
  from concurrent.futures import TimeoutError
  s=self.service();pending=Mock();pending.result.side_effect=TimeoutError()
  s.inflight['leads']=pending;s.cache['leads']=(0,{'rows':['old']})
  s.load_dataset=Mock()
  with patch('app.time.monotonic',return_value=301):
   with self.assertRaises(GatewayError) as e:s.read({'dataset':'leads','route':'/'},'token')
  self.assertEqual(e.exception.code,'source_refresh_pending')
  self.assertIs(s.inflight['leads'],pending)
  s.load_dataset.assert_not_called()
