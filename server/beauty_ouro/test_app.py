import datetime as dt
import unittest

from app import GatewayError, Service


class Connection:
    def __init__(self):
        self.queries = []

    def __enter__(self): return self
    def __exit__(self, *_): return None

    def execute(self, query):
        self.queries.append(query)
        return self

    def fetchone(self): return {'u': 'dashboard_beauty_ro', 'unsafe': False}
    def fetchall(self): return [
        {'dia': dt.date(2026, 10, 5), 'inscricoes': 2, 'observado_em': None, 'lead_email': 'private@example.org'}
    ]


class BeautyGatewayTest(unittest.TestCase):
    def setUp(self):
        self.connection = Connection()

        def request(path, _token, _body):
            if path == '/auth/v1/user': return {'id': 'user-1'}
            return {'registrado': True, 'ativo': True, 'permissoes': ['aba.sop-marketing'], 'marcas': ['we-scale']}

        self.service = Service({'mode': 'ouro'}, connect=lambda: self.connection, request_json=request)

    def test_fixed_aggregate_excludes_contact_data(self):
        result = self.service.read({'dataset': 'inscricoes', 'route': '/sop-marketing'}, 'session')
        self.assertEqual(result['rows'], [{'dia': dt.date(2026, 10, 5), 'inscricoes': 2}])
        self.assertTrue(any('ouro.vw_beauty_inscricoes_dia' in q for q in self.connection.queries))
        self.assertNotIn('private@example.org', str(result))

    def test_rejects_arbitrary_query_and_route(self):
        for body in ({'dataset': 'inscricoes', 'route': '/sop-marketing', 'sql': 'select *'},
                     {'dataset': 'inscricoes', 'route': '/'}):
            with self.assertRaises(GatewayError) as caught: self.service.read(body, 'session')
            self.assertEqual(caught.exception.status, 400)
        self.assertEqual(self.connection.queries, [])

    def test_legacy_mode_does_not_query_gold(self):
        self.service.settings['mode'] = 'legacy'
        self.assertEqual(self.service.read({'dataset': 'inscricoes', 'route': '/sop-marketing'}, 'session'), {'mode': 'legacy'})
        self.assertEqual(self.connection.queries, [])

    def test_denies_user_without_we_scale_scope(self):
        def request(path, _token, _body):
            if path == '/auth/v1/user': return {'id': 'user-1'}
            return {'registrado': True, 'ativo': True, 'permissoes': ['aba.sop-marketing'], 'marcas': ['liso-laser']}

        self.service.request_json = request
        with self.assertRaises(GatewayError) as caught:
            self.service.read({'dataset': 'inscricoes', 'route': '/sop-marketing'}, 'session')
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(self.connection.queries, [])


if __name__ == '__main__': unittest.main()
