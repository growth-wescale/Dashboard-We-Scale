import copy
import unittest
from prepare import normalize, FIELDS, sql


class ContractTest(unittest.TestCase):
    def setUp(self):
        self.catalog = {'verificado': '2026-11-18', 'fluxos': [{'id': 'a', 'modelos': ['1']}]}
        self.row = dict(fluxo='a', acao='action', dia='2026-11-17', fim='2026-11-17', **{f: 0 for f in FIELDS})
        self.raw = {'cobertura': [{'dia': '2026-11-17', 'fim': '2026-11-17', 'last_observed_at': '2026-11-18'}], 'modelos': ['1'], 'medicoes': [self.row]}

    def test_zero_null_and_empty_preserved(self):
        self.row['unique_clicks'] = None
        d = normalize(self.raw, self.catalog)
        self.assertEqual(d['medicoes'][0]['delivered'], 0)
        self.assertIsNone(d['medicoes'][0]['unique_clicks'])
        self.raw['medicoes'] = []
        self.assertEqual(normalize(self.raw, self.catalog)['medicoes'], [])

    def test_duplicate_unknown_month_and_invalid_metric_rejected(self):
        for patch in [{'fluxo': 'unknown'}, {'acao': ''}, {'fim': '2026-11-18'}, {'delivered': -1}, {'delivered': True}]:
            raw = copy.deepcopy(self.raw)
            raw['medicoes'][0].update(patch)
            with self.assertRaises(ValueError):
                normalize(raw, self.catalog)
        self.raw['medicoes'].append(dict(self.row))
        with self.assertRaises(ValueError):
            normalize(self.raw, self.catalog)

    def test_catalog_and_coverage_required(self):
        for key in ['modelos', 'cobertura']:
            raw = copy.deepcopy(self.raw); raw[key] = []
            with self.assertRaises(ValueError):
                normalize(raw, self.catalog)

    def test_sql_only_ouro_daily(self):
        q = sql(self.catalog)
        self.assertTrue(q.startswith('SELECT'))
        self.assertNotIn('prata.', q)
        self.assertNotIn('bronze.', q)
        self.assertNotIn('automacoes_mensal', q)
        self.assertIn('automacoes_diario', q)


if __name__ == '__main__':
    unittest.main()
