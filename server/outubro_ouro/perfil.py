"""Projeção de perfil da negociação e formato consumido por Marketing."""
from pathlib import Path

ROOT = Path(__file__).parent


def consulta_perfil():
    template = (ROOT / "perfil.sql").read_text()
    negocios = (ROOT / "negocios.sql").read_text()
    return template[template.index("WITH negocios"):].replace("/* negocios.sql */", negocios)


def linha_negocio(row):
    return {
        "id": "ouro-deal:" + row["negocio_id"], "dia": str(row["dia"])[:10], "marca": row["marca"],
        "criado_em": row["criado_em"], "uf": row["uf"],
        **{key: row[key] for key in ("utm_source", "utm_medium", "utm_campaign")},
        **dict.fromkeys(("nome", "email", "telefone", "cidade", "formulario", "row_hash")),
        "dados_extras": {
            "metric_grain": "crm_deal", "origem_leitura": "ouro_outubro_2026", "lead_type": "MQL",
            "conta_id": row["conta_id"], "id_deal": row["negocio_id"], "fonte_macro": row["fonte_macro"],
            "crm_funil": row["nome_funil"], "utm_term": row["utm_term"], "utm_content": row["utm_content"],
            "capital": row["capital"], "contatos_vinculados": row["contatos_vinculados"],
        },
    }
