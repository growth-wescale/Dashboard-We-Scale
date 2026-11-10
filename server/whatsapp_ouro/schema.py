"""Gera a instalação aditiva da leitura de WhatsApp na ouro, sem executar SQL."""
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'whatsapp_previa'
ROLE = 'dashboard_whatsapp_ro'
OWNER = 'dashboard_whatsapp_leitura'
FUNCTIONS = {name: 'ouro.dashboard_whatsapp_' + name for name in ('contas', 'eventos')}


def funcao_sql(name, substituir=False):
    source = (SOURCE / (name + '.sql')).read_text().strip()
    select = source.replace("DATE '{inicio}'", 'inicio').replace("DATE '{fim}'", 'fim')
    create = 'CREATE OR REPLACE' if substituir else 'CREATE'
    return (f'{create} FUNCTION {FUNCTIONS[name]}(inicio date, fim date) RETURNS SETOF jsonb '
            'LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $wa$\n'
            'SELECT to_jsonb(q) FROM (\n' + select + '\n) q\n$wa$;')


def schema_sql():
    statements = [
        'BEGIN;', "SET LOCAL lock_timeout = '3s';",
        f'CREATE ROLE {OWNER} NOLOGIN NOINHERIT;',
        f'CREATE ROLE {ROLE} NOLOGIN NOINHERIT CONNECTION LIMIT 4;',
        f'ALTER ROLE {ROLE} SET default_transaction_read_only = on;',
        f'GRANT USAGE ON SCHEMA ouro, bronze, prata TO {OWNER};',
        f'GRANT SELECT ON ouro.vw_whatsapp_custo_rd, bronze.whatsapp_collection, '
        f'bronze.whatsapp_resource_snapshots, prata.whatsapp_tarifa_rd TO {OWNER};',
        f'GRANT CONNECT ON DATABASE oralunic_dw TO {ROLE};',
        f'GRANT USAGE ON SCHEMA ouro TO {ROLE};',
    ]
    for name, function in FUNCTIONS.items():
        statements += [
            funcao_sql(name),
            f'ALTER FUNCTION {function}(date,date) OWNER TO {OWNER};',
            f'REVOKE ALL ON FUNCTION {function}(date,date) FROM PUBLIC;',
            f'GRANT EXECUTE ON FUNCTION {function}(date,date) TO {ROLE};',
        ]
    return '\n'.join(statements + ['COMMIT;'])


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--atualizar-eventos', action='store_true')
    if parser.parse_args().atualizar_eventos:
        print("BEGIN;\nSET LOCAL lock_timeout = '3s';\n" + funcao_sql('eventos', substituir=True) + "\nCOMMIT;")
    else:
        print(schema_sql())
