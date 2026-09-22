import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { diffPermissoes, traduzirErroAcesso } from '@/lib/acessosAdmin'

// Tudo aqui lê/escreve no Supabase de MARKETING (onde vive o login). As tabelas
// acesso_* têm RLS: só quem tem 'acao.usuarios-gerenciar' consegue ler e gravar.

export interface UsuarioAcesso {
  usuarioId: string
  email: string
  criadoEm: string
  ultimoLogin: string | null
  convitePendente: boolean
  papelId: string | null
  papelNome: string | null
  /** Slugs de BRAND_LIST. null = todas as marcas. */
  marcas: string[] | null
  ativo: boolean
}

export interface PapelAcesso {
  id: string
  nome: string
  descricao: string | null
  acessoTotal: boolean
  sistema: boolean
  permissoes: string[]
}

interface LinhaListarUsuarios {
  usuario_id: string
  email: string
  criado_em: string
  ultimo_login: string | null
  convite_pendente: boolean
  papel_id: string | null
  papel_nome: string | null
  marcas: string[] | null
  ativo: boolean
}

export function useUsuariosAcesso() {
  const [usuarios, setUsuarios] = useState<UsuarioAcesso[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('acesso_listar_usuarios')
    if (error) {
      setErro(traduzirErroAcesso(error))
    } else {
      setUsuarios(((data ?? []) as LinhaListarUsuarios[]).map(r => ({
        usuarioId: r.usuario_id,
        email: r.email,
        criadoEm: r.criado_em,
        ultimoLogin: r.ultimo_login,
        convitePendente: r.convite_pendente,
        papelId: r.papel_id,
        papelNome: r.papel_nome,
        marcas: r.marcas && r.marcas.length > 0 ? r.marcas : null,
        ativo: r.ativo,
      })))
      setErro(null)
    }
    setCarregando(false)
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  return { usuarios, carregando, erro, recarregar }
}

interface LinhaPapel {
  id: string
  nome: string
  descricao: string | null
  acesso_total: boolean
  sistema: boolean
  acesso_papel_permissoes: { permissao: string }[] | null
}

export function usePapeisAcesso() {
  const [papeis, setPapeis] = useState<PapelAcesso[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('acesso_papeis')
      .select('id, nome, descricao, acesso_total, sistema, acesso_papel_permissoes(permissao)')
      .order('acesso_total', { ascending: false })
      .order('sistema', { ascending: false })
      .order('nome')
    if (error) {
      setErro(traduzirErroAcesso(error))
    } else {
      setPapeis(((data ?? []) as LinhaPapel[]).map(p => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        acessoTotal: p.acesso_total,
        sistema: p.sistema,
        permissoes: (p.acesso_papel_permissoes ?? []).map(x => x.permissao).sort(),
      })))
      setErro(null)
    }
    setCarregando(false)
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  return { papeis, carregando, erro, recarregar }
}

export type AcaoGerenciarUsuarios =
  | { acao: 'convidar'; email: string; papelId: string; marcas: string[] | null; redirectTo: string }
  | { acao: 'definir_acesso'; usuarioId: string; papelId: string; marcas: string[] | null }
  | { acao: 'desativar'; usuarioId: string }
  | { acao: 'reativar'; usuarioId: string }

/** Edge Function `gerenciar-usuarios` — convite, desativar e reativar precisam da chave de admin. */
export async function chamarGerenciarUsuarios(body: AcaoGerenciarUsuarios): Promise<{ ok: boolean; error: string | null; data: Record<string, unknown> | null }> {
  const { data, error } = await supabase.functions.invoke('gerenciar-usuarios', { body })
  if (error) {
    let mensagem = 'Não foi possível concluir. Tente de novo.'
    const resposta = (error as { context?: Response }).context
    if (resposta && typeof resposta.json === 'function') {
      try {
        const json = await resposta.json()
        if (typeof json?.error === 'string') mensagem = json.error
      } catch { /* resposta sem JSON — fica a mensagem genérica */ }
    }
    return { ok: false, error: mensagem, data: null }
  }
  return { ok: true, error: null, data: (data ?? null) as Record<string, unknown> | null }
}

/** Troca papel/marcas de quem já tem acesso. Direto na tabela — RLS confere a permissão. */
export async function alterarAcessoUsuario(usuarioId: string, papelId: string, marcas: string[] | null): Promise<string | null> {
  const { error } = await supabase.from('acesso_usuarios').update({ papel_id: papelId, marcas }).eq('user_id', usuarioId)
  return error ? traduzirErroAcesso(error) : null
}

export async function salvarPapel(input: {
  id: string | null
  nome: string
  descricao: string | null
  permissoes: string[]
  permissoesAtuais: string[]
}): Promise<string | null> {
  let id = input.id
  if (id) {
    const { error } = await supabase.from('acesso_papeis').update({ nome: input.nome, descricao: input.descricao }).eq('id', id)
    if (error) return traduzirErroAcesso(error)
  } else {
    const { data, error } = await supabase.from('acesso_papeis').insert({ nome: input.nome, descricao: input.descricao }).select('id').single()
    if (error || !data) return traduzirErroAcesso(error)
    id = (data as { id: string }).id
  }

  const { adicionar, remover } = diffPermissoes(input.permissoesAtuais, input.permissoes)
  if (remover.length > 0) {
    const { error } = await supabase.from('acesso_papel_permissoes').delete().eq('papel_id', id).in('permissao', remover)
    if (error) return traduzirErroAcesso(error)
  }
  if (adicionar.length > 0) {
    const { error } = await supabase.from('acesso_papel_permissoes').insert(adicionar.map(permissao => ({ papel_id: id, permissao })))
    if (error) return traduzirErroAcesso(error)
  }
  return null
}

export async function apagarPapel(id: string): Promise<string | null> {
  const { error } = await supabase.from('acesso_papeis').delete().eq('id', id)
  return error ? traduzirErroAcesso(error) : null
}
