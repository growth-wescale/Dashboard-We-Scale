def pode_ler_gastos(access):
    """O resumo inclui todas as marcas e exige acesso ao consolidado."""
    if not isinstance(access, dict) or access.get('registrado') is not True or access.get('ativo') is not True:
        return False
    if access.get('acesso_total') is True:
        return True
    permissoes = access.get('permissoes')
    return (
        'marcas' in access and access['marcas'] is None and access.get('marca') is None
        and isinstance(permissoes, list) and 'aba.gastos-whatsapp' in permissoes
    )
