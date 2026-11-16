import gzip
import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer

from app import BASE, Gateway, Handler, accepts_gzip


class CompressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gateway = Gateway({})
        cls.access = dict(registrado=True, ativo=True, acesso_total=True)
        cls.gateway.auth = lambda path, token, body=None: {'id': 'test'} if body is None else cls.access
        cls.gateway.load = lambda key=None: (
            {'dia': '2026-11-16', 'publicado': '2026-11-16T14:00:00Z'},
            {'leads': [{'id': str(i), 'marca': 'Inpot', 'nome': 'Inscrição de teste'} for i in range(100)], 'media': []})
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.server.gateway = cls.gateway
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, encoding=None, token='session', **changes):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        headers = {'Content-Type': 'application/json'}
        if token: headers['Authorization'] = 'Bearer ' + token
        if encoding is not None: headers['Accept-Encoding'] = encoding
        body = {'route': '/', 'dataset': 'leads', 'periodo': {'inicio': '2026-11-01', 'fim': '2026-11-16'}}
        conn.request('POST', BASE + '/v1/read', json.dumps({**body, **changes}), headers)
        res = conn.getresponse()
        result = res.status, dict(res.getheaders()), res.read()
        conn.close()
        return result

    def test_compressed_body_is_identical_and_headers_describe_wire_bytes(self):
        status, plain_headers, plain = self.request('identity')
        gz_status, headers, compressed = self.request('gzip, deflate, br')
        self.assertEqual((status, gz_status), (200, 200))
        self.assertNotIn('Content-Encoding', plain_headers)
        self.assertEqual(headers['Content-Encoding'], 'gzip')
        self.assertEqual(gzip.decompress(compressed), plain)
        self.assertLess(len(compressed), len(plain))
        for h, b in [(headers, compressed), (plain_headers, plain)]:
            self.assertEqual(int(h['Content-Length']), len(b))
            self.assertEqual(h['Cache-Control'], 'no-store')
            self.assertEqual(h['Vary'], 'Accept-Encoding')
            self.assertEqual(h['Content-Type'], 'application/json')
            self.assertEqual(h['X-Content-Type-Options'], 'nosniff')

    def test_negotiation_respects_explicit_refusal_and_unsupported_encodings(self):
        for header in ['', 'identity', 'br', 'gzip;q=0', 'gzip;q=0, *;q=1', '*;q=0', 'gzip;q=bogus', 'gzip;q=NaN', 'gzip;q=2']:
            with self.subTest(header=header):
                self.assertFalse(accepts_gzip(header))
                self.assertNotIn('Content-Encoding', self.request(header)[1])
        for header in ['gzip', 'GZip; q=0.5', '*', '*;q=0, gzip;q=1']:
            with self.subTest(header=header):
                self.assertTrue(accepts_gzip(header))
                self.assertEqual(self.request(header)[1]['Content-Encoding'], 'gzip')

    def test_missing_encoding_keeps_identity(self):
        self.assertNotIn('Content-Encoding', self.request()[1])

    def test_small_body_and_errors_are_not_compressed(self):
        self.assertNotIn('Content-Encoding', self.request('gzip', dataset='media')[1])
        for changes, expected in [({'token': None}, 401), ({'route': '/vendas'}, 400)]:
            status, headers, body = self.request('gzip', **changes)
            self.assertEqual(status, expected)
            self.assertNotIn('Content-Encoding', headers)
            self.assertIn('code', json.loads(body))

    def test_compression_never_bypasses_live_permissions(self):
        self.request('gzip')
        self.access['ativo'] = False
        try:
            self.assertEqual(self.request('gzip')[0], 403)
        finally:
            self.access['ativo'] = True


if __name__ == '__main__':
    unittest.main()
