import unittest
from prepare import consolidar_modelos

def medicao(produto, tipo='btg', modelo='abertura', **kwargs):
    return dict(conta='1', marca='Lisô Laser', id=modelo, modelo=modelo,
                dia='2026-10-19', evento=tipo, produto=produto, desatualizado=False,
                enviados=10, entregues=8, lidos=3, projecao=3.60, **kwargs)

class MedicoesPorFinalidade(unittest.TestCase):
    def test_series_espelhadas_e_modelos_diferentes(self):
        rows = [medicao(p) for p in ('CAMPAIGN_INSIGHTS','MARKETING_MESSAGES_LITE_API')]
        rows.append(medicao('OUTRO',modelo='lembrete'))
        rows.append(medicao('OUTRO','rotina','cad_t04_liso_v2'))
        eventos, finais = consolidar_modelos(rows)
        self.assertEqual(len(eventos),2)
        self.assertEqual(sum(r['projecao'] for r in eventos),7.2)
        self.assertEqual({r['tipo']: r['enviados'] for r in finais},{'evento':20,'rotina':10})

    def test_divergencia_em_envios_nao_gera_atribuicao(self):
        eventos, finais = consolidar_modelos([medicao('A'), dict(medicao('B'),enviados=11)])
        self.assertIsNone(eventos[0]['enviados'])
        self.assertEqual(finais,[])

    def test_cobertura_anterior_e_rotulos_ambiguos(self):
        self.assertEqual(consolidar_modelos([dict(medicao('A'),desatualizado=True)])[1],[])
        self.assertEqual(consolidar_modelos([medicao('A'),medicao('B','rotina')]),([],[]))

    def test_mesma_serie_repetida(self):
        with self.assertRaises(ValueError):
            consolidar_modelos([medicao('A'),medicao('A')])
