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


class IdentidadeNegocioTest(unittest.TestCase):
    def test_identidade_acompanha_negocio_sem_mudar_seu_grao(self):
        from perfil import linha_negocio
        row = dict(negocio_id='D1', conta_id='ws', dia='2026-11-09', criado_em='2026-11-09',
                   marca='Inpot', uf=None, fonte_macro=None, nome_funil=None, capital=None,
                   utm_campaign=None, utm_source=None, utm_medium=None, utm_term=None, utm_content=None,
                   contatos_vinculados=1)
        antes = linha_negocio(row)
        depois = linha_negocio(dict(row, nome='Pessoa Exemplo', email='pessoa@example.invalid'))
        self.assertEqual(antes['id'], 'ouro-deal:D1')
        self.assertEqual(antes['dados_extras']['metric_grain'], 'crm_deal')
        self.assertEqual(depois, {**antes, 'nome':'Pessoa Exemplo', 'email':'pessoa@example.invalid'})
        self.assertIsNone(antes['nome'])
        self.assertIsNone(antes['email'])
