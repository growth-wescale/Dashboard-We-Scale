"""Emit the one-time DDL for the three scoped views. Never replace existing objects."""
from perfil import ROOT, consulta_perfil

ROLE = 'dashboard_outubro_marketing_ro'
SOURCES = {
    'captacoes': (ROOT / 'captacoes.sql').read_text(),
    'negocios': consulta_perfil(),
    'midia': (ROOT / 'anuncios.sql').read_text(),
}


def views_sql():
    statements = []
    for name, select in SOURCES.items():
        view = 'ouro.vw_outubro_marketing_' + name
        statements.extend([
            f'CREATE VIEW {view} AS\n{select};',
            f'REVOKE ALL ON {view} FROM PUBLIC;',
            f'GRANT SELECT ON {view} TO {ROLE};',
        ])
    return '\n'.join(statements)


if __name__ == '__main__':
    print('BEGIN;\n' + views_sql() + '\nCOMMIT;')
