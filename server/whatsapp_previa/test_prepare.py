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

    def test_cliques_somam_botoes_sem_duplicar_unicos_ou_produtos(self):
        clicks = {'url_button': 7, 'unique_url_button': 3, 'quick_reply_button': 2}
        rows = [medicao(p, cliques_por_tipo=clicks) for p in ('A', 'B')]
        self.assertEqual(consolidar_modelos(rows)[0][0]['cliques'], 9)

    def test_cliques_zero_ausencia_e_divergencia(self):
        for value, expected in [({'url_button': 0}, 0), ({}, None), (None, None), ({'unique_url_button': 2}, None)]:
            row = medicao('A', cliques_por_tipo=value)
            self.assertEqual(consolidar_modelos([row])[0][0]['cliques'], expected)
        rows = [medicao('A', cliques_por_tipo={'url_button': 3}), medicao('B', cliques_por_tipo={'quick_reply_button': 3})]
        self.assertIsNone(consolidar_modelos(rows)[0][0]['cliques'])
        self.assertIsNone(consolidar_modelos([dict(rows[0], desatualizado=True)])[0][0]['cliques'])

    def test_medicao_so_de_cliques_preserva_entregas_e_projecoes(self):
        row = medicao('A', cliques_por_tipo={'url_button': 2})
        clique = dict(row, produto='B', enviados=None, entregues=None, lidos=None, projecao=None)
        eventos, finais = consolidar_modelos([row, clique])
        self.assertEqual((eventos[0]['entregues'], eventos[0]['projecao'], eventos[0]['cliques']), (8, 3.6, 2))
        self.assertFalse(eventos[0]['somente_cliques'])
        eventos, finais = consolidar_modelos([clique])
        self.assertTrue(eventos[0]['somente_cliques'])
        self.assertIsNone(eventos[0]['projecao'])
        self.assertEqual(finais, [])
