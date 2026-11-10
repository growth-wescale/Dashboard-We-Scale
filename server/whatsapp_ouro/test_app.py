from datetime import date
from io import BytesIO
import json
import time
import unittest
from unittest.mock import patch
from app import autorizar, Cache, Error, periodos


class GatewayWhatsapp(unittest.TestCase):
    settings = {'supabase_url': 'https://example.invalid', 'supabase_anon_key': 'public'}

    def test_dois_dias_da_virada_entram_em_uma_janela_cada(self):
        periods = list(periodos(date(2027, 1, 1)))
        self.assertEqual(periods[1], (date(2026, 10, 1), date(2026, 10, 31)))
        self.assertEqual(periods[-1], (date(2027, 1, 1), date(2027, 1, 1)))
        for (_, end), (start, _) in zip(periods, periods[1:]):
            self.assertEqual((start-end).days, 1)

    def test_permissoes_reavaliadas_no_cache(self):
        cache = Cache(self.settings)
        cache.snapshot = (time.monotonic(), b'{}', 'now')
        for allowed in (True, False):
            access = dict(ativo=True, registrado=True, acesso_total=allowed)
            with patch('app.urlopen', side_effect=[BytesIO(b'{"id":"user"}'), BytesIO(json.dumps(access).encode())]):
                if allowed:
                    autorizar(self.settings, 'token')
                    self.assertEqual(cache.current()[1], b'{}')
                else:
                    with self.assertRaises(Error) as denied:
                        autorizar(self.settings, 'token')
                    self.assertEqual(denied.exception.status, 403)

    def test_permissao_da_tela_exige_cadastro_ativo_e_todas_as_marcas(self):
        role = dict(registrado=True, ativo=True, acesso_total=False, marcas=None,
                    permissoes=['aba.gastos-whatsapp'])
        for changes, allowed in [
            ({}, True), ({'registrado': False}, False), ({'ativo': False}, False),
            ({'marcas': ['inpot']}, False), ({'marca': 'inpot'}, False),
            ({'permissoes': []}, False), ({'permissoes': 'aba.gastos-whatsapp'}, False),
        ]:
            access = {**role, **changes}
            with self.subTest(changes=changes), patch('app.urlopen', side_effect=[
                BytesIO(b'{"id":"user"}'), BytesIO(json.dumps(access).encode())
            ]):
                if allowed:
                    autorizar(self.settings, 'token')
                else:
                    with self.assertRaises(Error) as denied:
                        autorizar(self.settings, 'token')
                    self.assertEqual(denied.exception.status, 403)

    def test_snapshot_vencido(self):
        cache = Cache(self.settings)
        for snapshot in [None, (time.monotonic()-7201, b'{}', 'old')]:
            cache.snapshot = snapshot
            with self.assertRaises(Error) as stale:
                cache.current()
            self.assertEqual(stale.exception.status, 503)

    def test_sem_sessao(self):
        with self.assertRaises(Error) as denied:
            autorizar(self.settings, '')
        self.assertEqual(denied.exception.status, 401)
