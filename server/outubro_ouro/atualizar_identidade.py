"""Emite a migração das duas views de negócios; não executa SQL."""
from perfil import ROOT, consulta_perfil


def migracao():
    mensal = (ROOT.parent / 'marketing_mensal_previa' / 'negocios.sql').read_text().format(
        inicio='2026-11-01', fim_exclusivo='9999-12-31').strip().rstrip(';')
    views = {
        'ouro.vw_outubro_marketing_negocios': consulta_perfil(),
        'ouro.vw_marketing_mensal_negocios': consulta_perfil(mensal),
    }
    statements = ['BEGIN;', "SET LOCAL lock_timeout = '3s';"]
    for view, query in views.items():
        statements.append(f'CREATE OR REPLACE VIEW {view} AS\n{query};')
    return '\n'.join([*statements, 'COMMIT;'])


if __name__ == '__main__':
    print(migracao())
