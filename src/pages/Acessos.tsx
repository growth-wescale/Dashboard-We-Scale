import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Plus, Search, ShieldCheck, UserPlus, X } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { MultiSelect, labelStyle as filtroLabelStyle } from '@/components/ui/MultiSelect'
import { useAuth } from '@/hooks/useAuth'
import { useAcesso } from '@/contexts/AcessoContext'
import { BRAND_LIST } from '@/constants/brands'
import { ABAS, ACOES, TELAS_COM_FILTRO_DE_MARCA } from '@/lib/permissoes'
import {
  FILTROS_VAZIOS, ORDEM_PADRAO, ORDEM_STATUS, SEM_LIMITE_DE_MARCA,
  filtrarUsuarios, fmtUltimoAcesso, ordenarUsuarios, proximaOrdem, resumoMarcas, statusDoUsuario, temFiltroAtivo,
  type ColunaOrdem, type FiltrosUsuarios, type Ordem, type StatusUsuario,
} from '@/lib/acessosAdmin'
import {
  alterarAcessoUsuario, apagarPapel, chamarGerenciarUsuarios, salvarPapel, usePapeisAcesso, useUsuariosAcesso,
  type PapelAcesso, type UsuarioAcesso,
} from '@/hooks/useAcessosAdmin'
import {
  bannerStyle, cardStyle, disabledButtonStyle, inputStyle, primaryButtonStyle, secondaryButtonStyle,
} from '@/components/metas/metasUi'

type Aviso = { tipo: 'sucesso' | 'erro'; texto: string } | null

const STATUS_VISUAL: Record<StatusUsuario, { label: string; bg: string; fg: string }> = {
  ativo:        { label: 'Ativo',        bg: 'var(--status-positivo-bg)', fg: 'var(--status-positivo)' },
  pendente:     { label: 'Nunca entrou', bg: 'var(--status-atencao-bg)',  fg: 'var(--status-atencao)' },
  desativado:   { label: 'Desativado',   bg: 'var(--status-risco-bg)',    fg: 'var(--status-risco)' },
  'sem-acesso': { label: 'Sem acesso',   bg: 'var(--ws-bg)',              fg: 'var(--ws-text-secondary)' },
}

/** Nomes das telas que funcionam pra quem é limitado a marcas, na ordem do menu. */
const TELAS_FILTRADAS_TEXTO = ABAS.filter(a => TELAS_COM_FILTRO_DE_MARCA.has(a.chave)).map(a => a.label).join(', ')

function pill(bg: string, fg: string): CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg, whiteSpace: 'nowrap' }
}

const selectStyle: CSSProperties = { ...inputStyle, padding: '6px 8px', maxWidth: 220, width: '100%' }
const th: CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', padding: '10px 12px', whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }

function botaoTexto(cor: string): CSSProperties {
  return { border: 'none', background: 'none', padding: '6px 4px', fontSize: 13, fontWeight: 600, color: cor, cursor: 'pointer', fontFamily: 'var(--font-body)' }
}

function marcaLabel(slug: string): string {
  return BRAND_LIST.find(b => b.key === slug)?.label ?? slug
}

// ── Página ───────────────────────────────────────────────────────────────────
export function Acessos() {
  const [aba, setAba] = useState<'usuarios' | 'papeis'>('usuarios')
  const [aviso, setAviso] = useState<Aviso>(null)
  const usuariosQ = useUsuariosAcesso()
  const papeisQ = usePapeisAcesso()
  const acesso = useAcesso()
  const { session } = useAuth()

  async function recarregarTudo() {
    await Promise.all([usuariosQ.recarregar(), papeisQ.recarregar(), acesso.recarregar()])
  }

  const pessoasPorPapel = useMemo(() => {
    const m = new Map<string, number>()
    for (const u of usuariosQ.usuarios) if (u.papelId) m.set(u.papelId, (m.get(u.papelId) ?? 0) + 1)
    return m
  }, [usuariosQ.usuarios])

  const abaBotao = (ativa: boolean): CSSProperties => ({
    padding: '8px 16px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font-body)', border: ativa ? 'none' : '1px solid var(--ws-border)',
    background: ativa ? 'var(--ws-text-primary)' : 'var(--ws-surface)',
    color: ativa ? 'var(--ws-surface)' : 'var(--ws-text-secondary)',
  })

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 32px)', maxWidth: 1200, margin: '0 auto' }}>
      <PageTop
        title="Usuários & Acessos"
        subtitle="Quem entra no dashboard, o que cada pessoa vê e o que pode fazer."
      />

      <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button role="tab" aria-selected={aba === 'usuarios'} onClick={() => setAba('usuarios')} style={abaBotao(aba === 'usuarios')}>
          Usuários{usuariosQ.usuarios.length > 0 ? ` · ${usuariosQ.usuarios.length}` : ''}
        </button>
        <button role="tab" aria-selected={aba === 'papeis'} onClick={() => setAba('papeis')} style={abaBotao(aba === 'papeis')}>
          Tipos de acesso{papeisQ.papeis.length > 0 ? ` · ${papeisQ.papeis.length}` : ''}
        </button>
      </div>

      {aviso && (
        <div role="status" style={{ ...bannerStyle(aviso.tipo), fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{aviso.texto}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso" style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
        </div>
      )}

      {aba === 'usuarios' ? (
        <AbaUsuarios
          usuarios={usuariosQ.usuarios}
          papeis={papeisQ.papeis}
          pessoasPorPapel={pessoasPorPapel}
          carregando={usuariosQ.carregando || papeisQ.carregando}
          erro={usuariosQ.erro ?? papeisQ.erro}
          meuId={session?.user.id ?? null}
          onAviso={setAviso}
          onMudou={recarregarTudo}
        />
      ) : (
        <AbaPapeis
          papeis={papeisQ.papeis}
          carregando={papeisQ.carregando}
          erro={papeisQ.erro}
          pessoasPorPapel={pessoasPorPapel}
          onAviso={setAviso}
          onMudou={recarregarTudo}
        />
      )}
    </div>
  )
}

// ── Aba Usuários ─────────────────────────────────────────────────────────────
function AbaUsuarios({ usuarios, papeis, pessoasPorPapel, carregando, erro, meuId, onAviso, onMudou }: {
  usuarios: UsuarioAcesso[]
  papeis: PapelAcesso[]
  pessoasPorPapel: Map<string, number>
  carregando: boolean
  erro: string | null
  meuId: string | null
  onAviso: (a: Aviso) => void
  onMudou: () => Promise<void>
}) {
  const [filtros, setFiltros] = useState<FiltrosUsuarios>(FILTROS_VAZIOS)
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO)
  const [convidando, setConvidando] = useState(false)
  const [desativando, setDesativando] = useState<UsuarioAcesso | null>(null)
  const [editandoMarcas, setEditandoMarcas] = useState<UsuarioAcesso | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const papelPorId = useMemo(() => new Map(papeis.map(p => [p.id, p])), [papeis])

  const contagemStatus = useMemo(() => {
    const c: Record<StatusUsuario, number> = { ativo: 0, pendente: 0, desativado: 0, 'sem-acesso': 0 }
    for (const u of usuarios) c[statusDoUsuario(u)] += 1
    return c
  }, [usuarios])

  const opcoesStatus = ORDEM_STATUS.map(s => ({ value: s, label: `${STATUS_VISUAL[s].label} (${contagemStatus[s]})` }))
  const opcoesPapel = papeis.map(p => ({ value: p.id, label: `${p.nome} (${pessoasPorPapel.get(p.id) ?? 0})` }))
  const opcoesMarca = [
    { value: SEM_LIMITE_DE_MARCA, label: 'Todas as marcas (sem limite)' },
    ...BRAND_LIST.map(b => ({ value: b.key, label: b.label })),
  ]

  const visiveis = useMemo(
    () => ordenarUsuarios(filtrarUsuarios(usuarios, filtros), ordem, marcaLabel),
    [usuarios, filtros, ordem],
  )

  const ordenarPor = (coluna: ColunaOrdem) => setOrdem(o => proximaOrdem(o, coluna))

  async function mudarPapel(u: UsuarioAcesso, papelId: string) {
    const papel = papelPorId.get(papelId)
    if (!papel || papelId === u.papelId) return
    const marcas = papel.acessoTotal ? null : u.marcas
    setOcupado(u.usuarioId)
    const falha = u.papelId
      ? await alterarAcessoUsuario(u.usuarioId, papelId, marcas)
      : (await chamarGerenciarUsuarios({ acao: 'definir_acesso', usuarioId: u.usuarioId, papelId, marcas })).error
    setOcupado(null)
    if (falha) { onAviso({ tipo: 'erro', texto: falha }); return }
    onAviso({ tipo: 'sucesso', texto: `${u.email} agora tem o acesso "${papel.nome}".` })
    await onMudou()
  }

  async function mudarMarcas(u: UsuarioAcesso, marcas: string[] | null) {
    if (!u.papelId) return
    setOcupado(u.usuarioId)
    const falha = await alterarAcessoUsuario(u.usuarioId, u.papelId, marcas)
    setOcupado(null)
    setEditandoMarcas(null)
    if (falha) { onAviso({ tipo: 'erro', texto: falha }); return }
    onAviso({ tipo: 'sucesso', texto: marcas ? `${u.email} agora só vê ${resumoMarcas(marcas, marcaLabel)}.` : `${u.email} agora vê todas as marcas.` })
    await onMudou()
  }

  async function mudarAtivo(u: UsuarioAcesso, ativar: boolean) {
    setOcupado(u.usuarioId)
    const r = await chamarGerenciarUsuarios({ acao: ativar ? 'reativar' : 'desativar', usuarioId: u.usuarioId })
    setOcupado(null)
    setDesativando(null)
    if (!r.ok) { onAviso({ tipo: 'erro', texto: r.error ?? 'Não foi possível concluir.' }); return }
    onAviso({ tipo: 'sucesso', texto: ativar ? `${u.email} pode entrar de novo.` : `${u.email} foi desativado e saiu do dashboard.` })
    await onMudou()
  }

  if (erro) return <div style={{ ...bannerStyle('erro'), fontSize: 13 }}>{erro}</div>

  const cabecalho = (coluna: ColunaOrdem, texto: string) => (
    <ThOrdenavel coluna={coluna} ordem={ordem} onOrdenar={ordenarPor}>{texto}</ThOrdenavel>
  )

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <Filtro titulo="Buscar">
          <label style={{ position: 'relative', display: 'block', width: 240, maxWidth: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-secondary)' }} />
            <input
              value={filtros.busca}
              onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
              placeholder="E-mail"
              aria-label="Buscar por e-mail"
              style={{ ...inputStyle, width: '100%', padding: '6px 10px 6px 28px' }}
            />
          </label>
        </Filtro>
        <Filtro titulo="Situação">
          <MultiSelect label="Situação" options={opcoesStatus} selected={filtros.status}
            onChange={v => setFiltros(f => ({ ...f, status: v as StatusUsuario[] }))} />
        </Filtro>
        <Filtro titulo="Tipo de acesso">
          <MultiSelect label="Tipo de acesso" options={opcoesPapel} selected={filtros.papeis}
            onChange={v => setFiltros(f => ({ ...f, papeis: v }))} />
        </Filtro>
        <Filtro titulo="Marca">
          <MultiSelect label="Marca" options={opcoesMarca} selected={filtros.marcas}
            onChange={v => setFiltros(f => ({ ...f, marcas: v }))} />
        </Filtro>
        {temFiltroAtivo(filtros) && (
          <button onClick={() => setFiltros(FILTROS_VAZIOS)} style={{ ...botaoTexto('var(--ws-text-secondary)'), fontWeight: 500, textDecoration: 'underline' }}>
            Limpar filtros
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setConvidando(true)} disabled={papeis.length === 0} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <UserPlus size={16} /> Convidar pessoa
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginBottom: 8 }}>
        {visiveis.length === usuarios.length
          ? `${usuarios.length} ${usuarios.length === 1 ? 'pessoa' : 'pessoas'}`
          : `Mostrando ${visiveis.length} de ${usuarios.length} pessoas`}
        {' · clique no título de uma coluna pra ordenar'}
      </div>

      {carregando ? (
        <div style={{ padding: 24, fontSize: 13, color: 'var(--ws-text-secondary)' }}>Carregando usuários…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
            <thead>
              <tr>
                {cabecalho('email', 'Pessoa')}
                {cabecalho('papel', 'Tipo de acesso')}
                {cabecalho('marcas', 'Marcas')}
                {cabecalho('status', 'Situação')}
                {cabecalho('ultimoLogin', 'Último acesso')}
                <th style={th}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(u => {
                const status = STATUS_VISUAL[statusDoUsuario(u)]
                const eu = u.usuarioId === meuId
                const papel = u.papelId ? papelPorId.get(u.papelId) : undefined
                const trabalhando = ocupado === u.usuarioId
                const marcasTravadas = eu || trabalhando || !papel || papel.acessoTotal
                return (
                  <tr key={u.usuarioId} style={{ borderTop: '1px solid var(--ws-border)', opacity: trabalhando ? 0.55 : 1 }}>
                    <td style={td}>
                      <span style={{ fontWeight: 500, color: 'var(--ws-text-primary)', wordBreak: 'break-all' }}>{u.email}</span>
                      {eu && <span style={{ ...pill('var(--ws-bg)', 'var(--ws-text-secondary)'), marginLeft: 8 }}>você</span>}
                    </td>
                    <td style={td}>
                      <select
                        value={u.papelId ?? ''}
                        disabled={eu || trabalhando}
                        title={eu ? 'Seu próprio acesso só pode ser mudado por outro administrador.' : undefined}
                        onChange={e => { if (e.target.value) mudarPapel(u, e.target.value) }}
                        aria-label={`Tipo de acesso de ${u.email}`}
                        style={selectStyle}
                      >
                        {!u.papelId && <option value="">Liberar acesso…</option>}
                        {papeis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <button
                        type="button"
                        onClick={() => setEditandoMarcas(u)}
                        disabled={marcasTravadas}
                        title={papel?.acessoTotal ? 'Administrador sempre vê todas as marcas.' : eu ? 'Seu próprio acesso só pode ser mudado por outro administrador.' : 'Escolher marcas'}
                        aria-label={`Marcas de ${u.email}`}
                        style={{
                          ...selectStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          textAlign: 'left', cursor: marcasTravadas ? 'default' : 'pointer', opacity: marcasTravadas ? 0.6 : 1,
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumoMarcas(u.marcas, marcaLabel)}</span>
                        {!marcasTravadas && <Pencil size={13} style={{ flex: '0 0 auto', color: 'var(--ws-text-secondary)' }} />}
                      </button>
                    </td>
                    <td style={td}><span style={pill(status.bg, status.fg)}>{status.label}</span></td>
                    <td style={{ ...td, color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{fmtUltimoAcesso(u.ultimoLogin)}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!eu && u.papelId && (u.ativo
                        ? <button onClick={() => setDesativando(u)} disabled={trabalhando} style={botaoTexto('var(--status-risco)')}>Desativar</button>
                        : <button onClick={() => mudarAtivo(u, true)} disabled={trabalhando} style={botaoTexto('var(--status-positivo)')}>Reativar</button>)}
                    </td>
                  </tr>
                )
              })}
              {visiveis.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, padding: 24, color: 'var(--ws-text-secondary)' }}>Ninguém com esses filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--ws-text-secondary)', margin: '14px 0 0', lineHeight: 1.5 }}>
        Quem é limitado a algumas marcas só entra em {TELAS_FILTRADAS_TEXTO} — sempre só com as marcas dele, e só nas telas que o tipo de acesso libera.
      </p>

      {convidando && (
        <ModalConvite
          papeis={papeis}
          onFechar={() => setConvidando(false)}
          onConvidado={async texto => { setConvidando(false); onAviso({ tipo: 'sucesso', texto }); await onMudou() }}
        />
      )}

      {editandoMarcas && (
        <ModalMarcas
          usuario={editandoMarcas}
          salvando={ocupado === editandoMarcas.usuarioId}
          onFechar={() => setEditandoMarcas(null)}
          onSalvar={marcas => mudarMarcas(editandoMarcas, marcas)}
        />
      )}

      {desativando && (
        <Modal titulo="Desativar acesso" onFechar={() => setDesativando(null)}>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ws-text-primary)', margin: '0 0 20px' }}>
            <strong>{desativando.email}</strong> sai do dashboard na hora e não consegue entrar de novo até alguém reativar. Nada é apagado.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setDesativando(null)} style={secondaryButtonStyle}>Cancelar</button>
            <button
              onClick={() => mudarAtivo(desativando, false)}
              disabled={ocupado === desativando.usuarioId}
              style={{ ...primaryButtonStyle, background: 'var(--status-risco)', color: '#fff' }}
            >
              {ocupado === desativando.usuarioId ? 'Desativando…' : 'Desativar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Filtro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={filtroLabelStyle}>{titulo}</span>
      {children}
    </div>
  )
}

function ThOrdenavel({ coluna, ordem, onOrdenar, children }: {
  coluna: ColunaOrdem
  ordem: Ordem
  onOrdenar: (c: ColunaOrdem) => void
  children: ReactNode
}) {
  const ativa = ordem.coluna === coluna
  const Icone = !ativa ? ArrowUpDown : ordem.direcao === 'asc' ? ArrowUp : ArrowDown
  return (
    <th style={th} aria-sort={ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onOrdenar(coluna)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0,
          cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
          color: ativa ? 'var(--ws-text-primary)' : 'inherit',
        }}
      >
        {children}
        <Icone size={12} style={{ opacity: ativa ? 1 : 0.45 }} />
      </button>
    </th>
  )
}

/** "Todas as marcas" ou "Só algumas marcas" + checklist. Lista vazia com "só algumas" = inválido. */
function SeletorMarcas({ valor, onChange }: { valor: string[] | null; onChange: (v: string[] | null) => void }) {
  const grupo = useId()
  const opcao: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ws-text-primary)', cursor: 'pointer' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={opcao}>
        <input type="radio" name={grupo} checked={valor === null} onChange={() => onChange(null)} />
        Todas as marcas
      </label>
      <label style={opcao}>
        <input type="radio" name={grupo} checked={valor !== null} onChange={() => onChange(valor ?? [])} />
        Só algumas marcas
      </label>
      {valor !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, paddingLeft: 24 }}>
          {BRAND_LIST.map(b => {
            const marcada = valor.includes(b.key)
            return (
              <label key={b.key} style={opcao}>
                <input type="checkbox" checked={marcada} onChange={() => onChange(marcada ? valor.filter(x => x !== b.key) : [...valor, b.key])} />
                {b.label}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ModalMarcas({ usuario, salvando, onFechar, onSalvar }: {
  usuario: UsuarioAcesso
  salvando: boolean
  onFechar: () => void
  onSalvar: (marcas: string[] | null) => void
}) {
  const [valor, setValor] = useState<string[] | null>(usuario.marcas)
  const invalido = valor !== null && valor.length === 0
  return (
    <Modal titulo="Marcas" onFechar={onFechar}>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-primary)', margin: '0 0 16px' }}>
        Quais marcas <strong style={{ wordBreak: 'break-all' }}>{usuario.email}</strong> pode ver?
      </p>
      <SeletorMarcas valor={valor} onChange={setValor} />
      <p style={{ fontSize: 12, color: 'var(--ws-text-secondary)', margin: '16px 0 0', lineHeight: 1.5 }}>
        Limitando a marcas, a pessoa só entra em {TELAS_FILTRADAS_TEXTO}, e escolhe entre as marcas dela em cada uma.
      </p>
      {invalido && <div style={{ ...bannerStyle('atencao'), fontSize: 13, marginTop: 12 }}>Marque pelo menos uma marca, ou escolha "Todas as marcas".</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
        <button onClick={onFechar} style={secondaryButtonStyle}>Cancelar</button>
        <button onClick={() => onSalvar(valor)} disabled={invalido || salvando} style={invalido || salvando ? disabledButtonStyle : primaryButtonStyle}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  )
}

function ModalConvite({ papeis, onFechar, onConvidado }: {
  papeis: PapelAcesso[]
  onFechar: () => void
  onConvidado: (texto: string) => void
}) {
  const [email, setEmail] = useState('')
  const [papelId, setPapelId] = useState('')
  const [marcas, setMarcas] = useState<string[] | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const papel = papeis.find(p => p.id === papelId)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!papel) { setErro('Escolha o tipo de acesso.'); return }
    if (!papel.acessoTotal && marcas !== null && marcas.length === 0) { setErro('Marque pelo menos uma marca, ou escolha "Todas as marcas".'); return }
    setEnviando(true)
    const destino = email.trim()
    const r = await chamarGerenciarUsuarios({
      acao: 'convidar',
      email: destino,
      papelId: papel.id,
      marcas: papel.acessoTotal ? null : marcas,
      redirectTo: `${window.location.origin}/definir-senha`,
    })
    setEnviando(false)
    if (!r.ok) { setErro(r.error ?? 'Não foi possível convidar.'); return }
    onConvidado(r.data?.jaExistia === true
      ? `${destino} já tinha conta: o acesso foi liberado e um link pra definir a senha foi enviado por e-mail.`
      : `Convite enviado para ${destino}. A pessoa recebe um e-mail pra criar a senha.`)
  }

  const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--ws-text-primary)' }

  return (
    <Modal titulo="Convidar pessoa" onFechar={onFechar}>
      <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={label}>
          E-mail
          <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@wescale.com.br" style={{ ...inputStyle, padding: '9px 12px', fontSize: 14 }} />
        </label>
        <label style={label}>
          Tipo de acesso
          <select required value={papelId} onChange={e => setPapelId(e.target.value)} style={{ ...inputStyle, padding: '9px 12px', fontSize: 14 }}>
            <option value="" disabled>Escolher…</option>
            {papeis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          {papel?.descricao && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ws-text-secondary)' }}>{papel.descricao}</span>}
        </label>
        {papel && !papel.acessoTotal && (
          <div style={label}>
            Marcas
            <SeletorMarcas valor={marcas} onChange={setMarcas} />
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ws-text-secondary)' }}>Use pra quem é de fora, como franqueados: a pessoa só vê as marcas marcadas.</span>
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--ws-text-secondary)', margin: 0, lineHeight: 1.5 }}>
          A pessoa recebe um e-mail com um link pra criar a senha. Ninguém mais fica sabendo a senha dela.
        </p>
        {erro && <div style={{ ...bannerStyle('erro'), fontSize: 13 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onFechar} style={secondaryButtonStyle}>Cancelar</button>
          <button type="submit" disabled={enviando} style={enviando ? disabledButtonStyle : primaryButtonStyle}>
            {enviando ? 'Enviando…' : 'Enviar convite'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Aba Tipos de acesso ──────────────────────────────────────────────────────
function AbaPapeis({ papeis, carregando, erro, pessoasPorPapel, onAviso, onMudou }: {
  papeis: PapelAcesso[]
  carregando: boolean
  erro: string | null
  pessoasPorPapel: Map<string, number>
  onAviso: (a: Aviso) => void
  onMudou: () => Promise<void>
}) {
  const [editando, setEditando] = useState<PapelAcesso | 'novo' | null>(null)

  if (erro) return <div style={{ ...bannerStyle('erro'), fontSize: 13 }}>{erro}</div>
  if (carregando) return <div style={{ padding: 24, fontSize: 13, color: 'var(--ws-text-secondary)' }}>Carregando…</div>

  function resumo(p: PapelAcesso): string {
    if (p.acessoTotal) return 'Vê e faz tudo'
    const abas = p.permissoes.filter(x => x.startsWith('aba.')).length
    const acoes = p.permissoes.filter(x => x.startsWith('acao.')).length
    return `${abas} ${abas === 1 ? 'tela' : 'telas'} · ${acoes} ${acoes === 1 ? 'ação' : 'ações'}`
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ws-text-secondary)', maxWidth: 620, lineHeight: 1.5 }}>
          Cada tipo de acesso é um conjunto de telas que a pessoa vê e de ações que ela pode fazer. Mudar um tipo vale na hora pra todo mundo que tem ele.
        </p>
        <button onClick={() => setEditando('novo')} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Novo tipo de acesso
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
        {papeis.map(p => {
          const pessoas = pessoasPorPapel.get(p.id) ?? 0
          return (
            <div key={p.id} style={{ ...cardStyle, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {p.acessoTotal && <ShieldCheck size={16} style={{ color: 'var(--brand-accent)' }} />}
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ws-text-primary)' }}>{p.nome}</span>
                {p.sistema && <span style={pill('var(--ws-bg)', 'var(--ws-text-secondary)')}>padrão</span>}
              </div>
              {p.descricao && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', lineHeight: 1.5 }}>{p.descricao}</div>}
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--ws-border)' }}>
                <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
                  {resumo(p)} · <strong style={{ color: 'var(--ws-text-primary)', fontWeight: 600 }}>{pessoas} {pessoas === 1 ? 'pessoa' : 'pessoas'}</strong>
                </span>
                <button onClick={() => setEditando(p)} style={botaoTexto('var(--ws-text-primary)')}>
                  {p.acessoTotal ? 'Ver' : 'Editar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {editando && (
        <EditorPapel
          papel={editando === 'novo' ? null : editando}
          pessoas={editando === 'novo' ? 0 : pessoasPorPapel.get(editando.id) ?? 0}
          onFechar={() => setEditando(null)}
          onSalvo={async texto => { setEditando(null); onAviso({ tipo: 'sucesso', texto }); await onMudou() }}
        />
      )}
    </>
  )
}

function EditorPapel({ papel, pessoas, onFechar, onSalvo }: {
  papel: PapelAcesso | null
  pessoas: number
  onFechar: () => void
  onSalvo: (texto: string) => void
}) {
  const [nome, setNome] = useState(papel?.nome ?? '')
  const [descricao, setDescricao] = useState(papel?.descricao ?? '')
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(papel?.permissoes ?? []))
  const [salvando, setSalvando] = useState(false)
  const [confirmandoApagar, setConfirmandoApagar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const total = papel?.acessoTotal ?? false
  const sistema = papel?.sistema ?? false

  const SEM_MARCA = 'Não aparece pra quem é limitado a marcas.'
  const grupos: { titulo: string; itens: { chave: string; label: string; descricao?: string }[] }[] = [
    { titulo: 'Telas de Marketing', itens: ABAS.filter(a => a.area === 'Marketing').map(a => ({ ...a, descricao: TELAS_COM_FILTRO_DE_MARCA.has(a.chave) ? undefined : SEM_MARCA })) },
    { titulo: 'Telas de Vendas', itens: ABAS.filter(a => a.area === 'Vendas').map(a => ({ ...a, descricao: TELAS_COM_FILTRO_DE_MARCA.has(a.chave) ? undefined : SEM_MARCA })) },
    { titulo: 'Ações', itens: [...ACOES] },
  ]

  function alternar(chave: string) {
    setMarcadas(prev => {
      const n = new Set(prev)
      if (n.has(chave)) n.delete(chave)
      else n.add(chave)
      return n
    })
  }

  function marcarGrupo(chaves: string[], marcar: boolean) {
    setMarcadas(prev => {
      const n = new Set(prev)
      for (const c of chaves) {
        if (marcar) n.add(c)
        else n.delete(c)
      }
      return n
    })
  }

  async function salvar() {
    setErro(null)
    if (nome.trim() === '') { setErro('Dê um nome ao tipo de acesso.'); return }
    setSalvando(true)
    const falha = await salvarPapel({
      id: papel?.id ?? null,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      permissoes: [...marcadas],
      permissoesAtuais: papel?.permissoes ?? [],
    })
    setSalvando(false)
    if (falha) { setErro(falha); return }
    onSalvo(papel ? `"${nome.trim()}" atualizado.` : `"${nome.trim()}" criado. Agora é só escolher esse tipo pras pessoas.`)
  }

  async function apagar() {
    if (!papel) return
    if (!confirmandoApagar) { setConfirmandoApagar(true); return }
    setSalvando(true)
    const falha = await apagarPapel(papel.id)
    setSalvando(false)
    if (falha) { setErro(falha); setConfirmandoApagar(false); return }
    onSalvo(`"${papel.nome}" apagado.`)
  }

  const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--ws-text-primary)' }

  return (
    <Modal titulo={papel ? papel.nome : 'Novo tipo de acesso'} onFechar={onFechar} largura={760}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 14, marginBottom: 18 }}>
        <label style={label}>
          Nome
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            disabled={sistema || total}
            placeholder="Ex.: Time de Vendas"
            style={{ ...inputStyle, padding: '9px 12px', fontSize: 14 }}
          />
        </label>
        <label style={label}>
          Descrição
          <input
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            disabled={total}
            placeholder="Pra quem é esse acesso"
            style={{ ...inputStyle, padding: '9px 12px', fontSize: 14 }}
          />
        </label>
      </div>

      {total ? (
        <div style={{ ...bannerStyle('sucesso'), fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={16} /> Esse tipo de acesso vê e faz tudo, inclusive telas que ainda vão ser criadas. Não dá pra tirar permissões dele.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 20 }}>
            {grupos.map(g => {
              const chaves = g.itens.map(i => i.chave)
              const todas = chaves.every(c => marcadas.has(c))
              return (
                <fieldset key={g.titulo} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
                  <legend style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', marginBottom: 4, padding: 0 }}>
                    {g.titulo}
                  </legend>
                  <button type="button" onClick={() => marcarGrupo(chaves, !todas)} style={{ ...botaoTexto('var(--ws-text-secondary)'), fontSize: 12, fontWeight: 500, padding: '0 0 6px', textDecoration: 'underline' }}>
                    {todas ? 'Desmarcar todas' : 'Marcar todas'}
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {g.itens.map(item => (
                      <label key={item.chave} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, color: 'var(--ws-text-primary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={marcadas.has(item.chave)} onChange={() => alternar(item.chave)} style={{ marginTop: 2 }} />
                        <span>
                          {item.label}
                          {item.descricao && <span style={{ display: 'block', fontSize: 11, color: 'var(--ws-text-secondary)', lineHeight: 1.4, marginTop: 2 }}>{item.descricao}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )
            })}
          </div>
          <p style={{ fontSize: 12, color: 'var(--ws-text-secondary)', margin: '16px 0 0', lineHeight: 1.5 }}>
            Pra quem é limitado a marcas, as ações nunca valem: todas elas mexem com dados de todas as marcas.
          </p>
        </>
      )}

      {erro && <div style={{ ...bannerStyle('erro'), fontSize: 13, marginTop: 16 }}>{erro}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
        {papel && !sistema && (
          <button
            onClick={apagar}
            disabled={salvando || pessoas > 0}
            title={pessoas > 0 ? 'Mude o tipo de acesso dessas pessoas antes de apagar.' : undefined}
            style={{ ...botaoTexto(pessoas > 0 ? 'var(--ws-text-secondary)' : 'var(--status-risco)'), cursor: pessoas > 0 ? 'not-allowed' : 'pointer' }}
          >
            {pessoas > 0 ? `Não dá pra apagar (${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'})` : confirmandoApagar ? 'Clique de novo pra apagar' : 'Apagar'}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={secondaryButtonStyle}>{total ? 'Fechar' : 'Cancelar'}</button>
        {!total && (
          <button onClick={salvar} disabled={salvando} style={salvando ? disabledButtonStyle : primaryButtonStyle}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        )}
      </div>
    </Modal>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────
function Modal({ titulo, onFechar, children, largura = 480 }: {
  titulo: string
  onFechar: () => void
  children: ReactNode
  largura?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFechar])

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={e => e.stopPropagation()}
        style={{ ...cardStyle, width: '100%', maxWidth: largura, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20, color: 'var(--ws-text-primary)' }}>{titulo}</h3>
          <button onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary)', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
