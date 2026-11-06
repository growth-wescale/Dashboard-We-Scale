from copy import deepcopy
import time
import unittest
from unittest.mock import patch

from app import Error, Gateway, ROLE, datasets, period
from views import sources, views_sql


def media(brand='Inpot', id='one', campaign='test'):
    return dict(id=id, marca=brand, dia='2026-11-06', spend_brl=100,
                origem_leitura='ouro_marketing_mensal', campanha_id=campaign)


class GatewayTest(unittest.TestCase):
    def setUp(self):
        self.g = Gateway({})
        self.access = dict(registrado=True, ativo=True, permissoes=['aba.saude-marca'], marcas=['inpot'])
        self.g.auth = lambda path, token, body=None: {'id': 'user'} if body is None else self.access
        self.receipt = {'dia': '2026-11-06', 'publicado': '2026-11-06T14:02:06Z'}
        self.data = {'leads': [], 'media': [media(), media('Viva', 'two'),
                     media('Oral Unic', 'oral', '120249498633040752'),
                     media('Oral Unic', 'legacy', '24054143009')]}
        self.key = ('2026-11-01', '2026-11-06')
        self.g.load = lambda key=None: (self.receipt, self.data)
        self.g.refresh(self.key)

    def read(self, **changes):
        body = {'route': '/marca', 'dataset': 'media', 'periodo': {'inicio': self.key[0], 'fim': self.key[1]}}
        return self.g.read({**body, **changes}, 'session')

    def test_authorization_rechecked_for_shared_cache(self):
        self.assertEqual([r['id'] for r in self.read()['rows']], ['one'])
        self.access['marcas'] = ['viva']
        self.assertEqual([r['id'] for r in self.read()['rows']], ['two'])
        self.access['marcas'] = ['odonto-scale']
        self.assertEqual([r['id'] for r in self.read()['rows']], ['legacy'])
        self.access['marcas'] = ['oral-unic']
        self.assertEqual([r['id'] for r in self.read()['rows']], ['oral', 'legacy'])

    def test_inactive_and_wrong_route_cannot_use_cache(self):
        with self.assertRaises(Error):
            self.read(route='/sop-marketing')
        self.access.update(acesso_total=True, ativo=False)
        with self.assertRaises(Error):
            self.read()

    def test_sales_and_arbitrary_dataset_are_rejected(self):
        self.access['acesso_total'] = True
        for changes in ({'route': '/vendas'}, {'dataset': 'sql'}, {'query': 'select 1'}):
            with self.assertRaises(Error):
                self.read(**changes)

    def test_missing_or_anonymous_session(self):
        with self.assertRaises(Error):
            self.g.read({'route':'/marca','dataset':'media','periodo':{'inicio':self.key[0],'fim':self.key[1]}}, '')
        self.g.auth = lambda *args: {'id': 'anonymous', 'is_anonymous': True}
        with self.assertRaises(Error):
            self.read()

    def test_future_period_is_unavailable_not_zero(self):
        self.g.load = lambda key: (self.receipt, None)
        with self.assertRaises(Error) as e:
            self.read(periodo={'inicio':'2026-12-01','fim':'2026-12-31'})
        self.assertEqual((e.exception.status, e.exception.code), (409, 'periodo_sem_publicacao'))

    def test_partial_period_reports_coverage(self):
        r = self.read(periodo={'inicio':'2026-11-01','fim':'2026-11-30'})
        self.assertEqual(r['through'], '2026-11-06')
        self.assertEqual(r['warnings'], ['periodo_parcial'])

    def test_expired_snapshot_is_never_served_after_failure(self):
        self.g.cache[self.key] = (time.monotonic()-301, self.receipt, self.data)
        self.g.load = lambda key: (_ for _ in ()).throw(RuntimeError('query failed'))
        with self.assertRaises(RuntimeError):
            self.g.refresh(self.key)
        with self.assertRaises(Error) as e:
            self.read()
        self.assertEqual(e.exception.code, 'source_refresh_pending')

    def test_background_renews_after_180_seconds_including_month_transition(self):
        self.g.cache[self.key] = (time.monotonic()-181, self.receipt, self.data)
        fresh = deepcopy(self.data)
        fresh['media'][0]['spend_brl'] = 200
        self.g.load = lambda key: ({**self.receipt, 'dia':'2026-12-01'}, fresh)
        with patch('app.time.sleep', side_effect=[None, StopIteration]):
            with self.assertRaises(StopIteration):
                self.g.maintain()
        self.assertEqual(self.read()['rows'][0]['spend_brl'], 200)
        self.assertEqual(self.g.status()['dia'], '2026-12-01')

    def test_bounded_cache_and_period_specific_read(self):
        for day in range(1, 12):
            self.g.refresh(('2026-11-01', f'2026-11-{day:02}'))
        self.assertEqual(len(self.g.cache), 8)

    def test_period_validation_preserves_october(self):
        for raw in (None, {}, {'inicio':'2026-10-31','fim':'2026-11-06'},
                    {'inicio':'2026-11-20','fim':'2026-11-06'},
                    {'inicio':'20261101','fim':'2026-11-06'}):
            with self.assertRaises(Error):
                period(raw)
        self.assertEqual(period({'inicio':'2027-01-01','fim':'2027-01-31'}), ('2027-01-01','2027-01-31'))

    def test_snapshot_validator_rejects_duplicates_and_outside_scope(self):
        raw = {'captacoes':[], 'contatos':[], 'negocios':[], 'midia':[media()]}
        self.assertEqual(datasets(raw, *self.key)['media'], raw['midia'])
        for row in (media(id='one'), {**media(id='extra'), 'dia':'2026-10-31'},
                    {**media(id='extra'), 'marca':'We Scale'}, {**media(id='extra'), 'spend_brl':-1}):
            with self.assertRaises(Error):
                datasets({**raw, 'midia':[media(), row]}, *self.key)


class FakeResult:
    def __init__(self, rows): self.rows = rows
    def fetchone(self): return self.rows[0] if self.rows else None
    def fetchall(self): return self.rows


class FakeConnection:
    def __init__(self, unsafe=False): self.calls, self.unsafe = [], unsafe
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        if 'pg_roles' in sql: return FakeResult([{'rolname':ROLE, 'unsafe':self.unsafe}])
        if '_cobertura' in sql: return FakeResult([{'dia':'2026-11-06','publicado':'2026-11-06T14:02:06Z'}])
        return FakeResult([])


class SQLTest(unittest.TestCase):
    def test_queries_only_read_gold_with_bound_dates_and_one_snapshot(self):
        conn, g = FakeConnection(), Gateway({})
        g.connect = lambda: conn
        r, data = g.load(('2026-11-01','2026-11-30'))
        self.assertEqual(data, {'leads':[], 'media':[]})
        self.assertIn('REPEATABLE READ READ ONLY', conn.calls[0][0])
        for sql, params in conn.calls[3:]:
            self.assertTrue(sql.startswith('SELECT * FROM ouro.vw_marketing_mensal_'))
            self.assertEqual(params, ('2026-11-01','2026-11-06'))
            self.assertNotIn('prata.', sql)

    def test_unsafe_role_fails_before_reading_data(self):
        conn, g = FakeConnection(True), Gateway({})
        g.connect = lambda: conn
        with self.assertRaises(Error): g.load(('2026-11-01','2026-11-06'))
        self.assertEqual(len(conn.calls), 2)

    def test_future_period_does_not_query_or_zero_fill_datasets(self):
        conn, g = FakeConnection(), Gateway({})
        g.connect = lambda: conn
        _, data = g.load(('2027-01-01','2027-01-31'))
        self.assertIsNone(data)
        self.assertEqual(len(conn.calls), 3)

    def test_proposed_views_expose_profile_without_fact_writes(self):
        ddl = views_sql()
        self.assertEqual(ddl.count('CREATE VIEW'), 5)
        self.assertNotIn('CREATE OR REPLACE', ddl)
        for operation in ('INSERT INTO', 'UPDATE ', 'DELETE FROM', 'ALTER TABLE'):
            self.assertNotIn(operation, ddl)
        self.assertIn('prata.crm_negocio_contatos', sources()['negocios'])
        self.assertIn('2026-11-01', sources()['midia'])
        self.assertNotIn('{inicio}', ddl)


if __name__ == '__main__':
    unittest.main()
