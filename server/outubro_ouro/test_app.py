import time
import unittest

from app import BRANDS, Error, Gateway


class GatewayTest(unittest.TestCase):
    def setUp(self):
        self.access = dict(registrado=True, ativo=True, permissoes=['aba.saude-marca'], marcas=['inpot'])
        self.gateway = Gateway({})
        self.gateway.auth = lambda path, token, body=None: {'id': 'user'} if body is None else self.access
        self.gateway.snapshot = (time.monotonic(), 'now', {'leads': [{'marca': b} for b in BRANDS.values()]})

    def read(self, route='/marca'):
        return self.gateway.read({'dataset':'leads','route':route}, 'session')['rows']

    def test_shared_cache_is_filtered_after_each_authorization(self):
        self.assertEqual(self.read(), [{'marca':'Inpot'}])
        self.access['marcas'] = ['viva','b2case']
        self.assertEqual({r['marca'] for r in self.read()}, {'Viva','B2Case'})
        self.access['marcas'] = ['oral-unic']
        self.assertEqual(self.read(), [])

    def test_route_and_account_checked_even_when_cache_is_warm(self):
        with self.assertRaises(Error):
            self.read('/okrs')
        self.access.update(ativo=False, acesso_total=True)
        with self.assertRaises(Error):
            self.read()

    def test_expired_data_is_not_served(self):
        _, observed, rows = self.gateway.snapshot
        self.gateway.snapshot = (time.monotonic()-301, observed, rows)
        with self.assertRaises(Error) as ctx:
            self.read()
        self.assertEqual(ctx.exception.code, 'source_refresh_pending')
