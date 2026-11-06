"""DDL proposta, nunca executada por este módulo. Mantém SQL da prévia como fonte."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PREVIEW = ROOT.parent / 'marketing_mensal_previa'
ROLE = 'dashboard_marketing_mensal_ro'
PREFIX = 'ouro.vw_marketing_mensal_'


def sources():
    def sql(name):
        # Sem fechamento mensal fixo: o gateway filtra cada intervalo com parâmetros.
        return (PREVIEW / (name + '.sql')).read_text().format(
            inicio='2026-11-01', fim_exclusivo='9999-12-31').strip().rstrip(';')
    deals = sql('negocios')
    profile = (ROOT.parent / 'outubro_ouro' / 'perfil.sql').read_text()
    return {
        'captacoes': sql('captacoes'),
        'negocios': profile[profile.index('WITH negocios'):].replace('/* negocios.sql */', deals),
        'contatos': sql('contatos').replace('/* negocios.sql */', deals),
        'midia': sql('midia'),
        'cobertura': """SELECT snapshot_at, recorded_at AS publicado,
          to_char(snapshot_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS dia
          FROM ouro._refresh_receipts WHERE result->>'status'='validated'
          ORDER BY recorded_at DESC LIMIT 1""",
    }


def views_sql():
    statements = ['BEGIN;']
    for name, query in sources().items():
        view = PREFIX + name
        statements.extend([f'CREATE VIEW {view} AS\n{query};',
                           f'REVOKE ALL ON {view} FROM PUBLIC;',
                           f'GRANT SELECT ON {view} TO {ROLE};'])
    return '\n'.join([*statements, 'COMMIT;'])


if __name__ == '__main__':
    print(views_sql())
