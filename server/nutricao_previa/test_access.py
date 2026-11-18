"""A prévia nunca devolve a fotografia sem autenticação e acesso total."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('nutricao_handler', Path(__file__).with_name('preview.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AccessTest(unittest.TestCase):
    def request(self, access=None, token='Bearer test-only', origin=module.monthly.LOCAL, body=b'{}', missing=False):
        h = object.__new__(module.Handler)
        h.path = '/api/previa-nutricao/v1/resumo'
        h.headers = {'Host': '127.0.0.1:4175', 'Origin': origin, 'Authorization': token, 'Content-Length': str(len(body))}
        h.rfile = io.BytesIO(body)
        h.server = type('Server', (), {'public_key': 'public-test'})()
        result = []
        h.reply = lambda status, payload: result.append((status, payload))
        h.send_error = lambda status: result.append((status, None))
        with patch.object(module, 'urlopen', return_value=io.BytesIO(json.dumps(access).encode())) as upstream, patch.object(module.Path, 'read_text', side_effect=OSError() if missing else None, return_value='{"versao":1}') as read:
            h.do_POST()
            return result, upstream.call_count, read.call_count

    def test_anonymous_and_invalid_origins_never_read_snapshot(self):
        for kwargs, status in [({'token': ''}, 401), ({'origin': 'https://example.com'}, 403), ({'body': b'{"other":1}'}, 400)]:
            result, calls, reads = self.request(**kwargs)
            self.assertEqual(result[0][0], status)
            self.assertEqual((calls, reads), (0, 0))

    def test_restricted_disabled_unregistered_and_unknown_denied(self):
        for access in [None, [], {}, {'ativo': True, 'registrado': True, 'acesso_total': False}, {'ativo': False, 'registrado': True, 'acesso_total': True}, {'ativo': True, 'registrado': False, 'acesso_total': True}]:
            result, _, reads = self.request(access=access)
            self.assertEqual(result[0][0], 403)
            self.assertEqual(reads, 0)

    def test_authorized_reads_but_missing_source_is_not_zero(self):
        access = dict(ativo=True, registrado=True, acesso_total=True)
        result, calls, reads = self.request(access=access)
        self.assertEqual((result[0][0], calls, reads), (200, 1, 1))
        result, _, _ = self.request(access=access, missing=True)
        self.assertEqual(result[0][0], 503)


if __name__ == '__main__':
    unittest.main()
