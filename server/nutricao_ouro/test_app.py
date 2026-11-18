from io import BytesIO
import json
import threading
import time
import unittest
from unittest.mock import patch
from app import Cache, Error, Handler, authorize, allowed, REFRESH_SECONDS


class NutritionGateway(unittest.TestCase):
    settings = {'supabase_anon_key': 'public-test', 'metabase_key': 'test-only'}
    def test_authorization_fails_closed_and_per_brand_not_allowed(self):
        base = dict(ativo=True, registrado=True, acesso_total=False, marcas=None, permissoes=['aba.nutricao'])
        for change, expected in [({}, True), ({'marcas': ['inpot']}, False), ({'marca': 'inpot'}, False), ({'ativo': False}, False), ({'registrado': False}, False), ({'permissoes': []}, False), ({'permissoes': 'aba.nutricao'}, False)]:
            self.assertEqual(allowed({**base, **change}), expected)
        self.assertFalse(allowed(None))
        self.assertTrue(allowed(dict(ativo=True, registrado=True, acesso_total=True)))

    def test_user_and_permissions_revalidated_even_when_cache_populated(self):
        c = Cache(self.settings); c.snapshot = (time.monotonic(), b'{}', 'now')
        for granted in [True, False]:
            with patch('app.urlopen', side_effect=[BytesIO(b'{"id":"user"}'), BytesIO(json.dumps(dict(ativo=True, registrado=True, acesso_total=granted)).encode())]) as request:
                if granted:
                    authorize(self.settings, 'test-only'); self.assertEqual(c.current()[1], b'{}')
                else:
                    with self.assertRaises(Error) as denied: authorize(self.settings, 'test-only')
                    self.assertEqual(denied.exception.status, 403)
                self.assertEqual(request.call_count, 2)
        with patch('app.urlopen', return_value=BytesIO(b'{"id":"user","is_anonymous":true}')):
            with self.assertRaises(Error) as anonymous: authorize(self.settings, 'test-only')
            self.assertEqual(anonymous.exception.status, 401)

    def test_refresh_is_atomic_and_stale_data_is_rejected(self):
        c = Cache(self.settings)
        with self.assertRaises(Error): c.current()
        with patch('app.fetch_snapshot', return_value={'gerado': 'first', 'medicoes': [1]}), patch('app.time.monotonic', return_value=100): c.refresh()
        old = c.snapshot
        with patch('app.fetch_snapshot', side_effect=ValueError('invalid')):
            with self.assertRaises(ValueError): c.refresh()
        self.assertEqual(c.snapshot, old)
        with patch('app.time.monotonic', return_value=7299): self.assertEqual(c.current(), old)
        with patch('app.time.monotonic', return_value=7300):
            with self.assertRaises(Error): c.current()
        with patch('app.fetch_snapshot', return_value={'gerado': 'second', 'medicoes': [2]}): c.refresh()
        self.assertEqual(json.loads(c.current()[1])['medicoes'], [2])
        self.assertEqual(json.loads(c.current()[1])['modo'], 'automatico')

    def test_hourly_renewal_and_minute_retry(self):
        for failure, expected in [(False, 3600), (True, 60)]:
            c = Cache(self.settings)
            def wait(delay):
                self.assertEqual(delay, expected); c.stop.set()
            with patch.object(c, 'refresh', side_effect=RuntimeError if failure else None) as refresh, patch.object(c.stop, 'wait', side_effect=wait): c.maintain()
            refresh.assert_called_once()
        self.assertEqual(REFRESH_SECONDS, 3600)

    def test_http_only_fixed_body_route_and_auth_then_cache(self):
        def request(path='/api/nutricao-ouro/v1/resumo', token='Bearer test-only', body=b'{}', denied=False):
            h = object.__new__(Handler); h.path = path
            h.headers = {'Authorization': token, 'Content-Length': str(len(body))}; h.rfile = BytesIO(body)
            h.server = type('Server', (), {'slots': threading.BoundedSemaphore(8), 'cache': Cache(self.settings)})()
            h.server.cache.snapshot = (time.monotonic(), b'{"versao":1}', 'now')
            results = []; h.reply = lambda status, data: results.append((status, data))
            with patch('app.authorize', side_effect=Error(403, 'denied') if denied else None) as auth:
                h.do_POST();return results[0], auth.call_count
        for kwargs, status in [({'token': ''},401),({'body':b'{"sql":"select 1"}'},400),({'path':'/api/nutricao-ouro/vendas'},404),({'denied':True},403),({},200)]:
            result, calls = request(**kwargs); self.assertEqual(result[0], status)
            self.assertEqual(calls, int(status in (200,403)))


if __name__ == '__main__': unittest.main()
