import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Plus, Search, ShieldCheck, UserPlus, X } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { useAuth } from '@/hooks/useAuth'
import { useAcesso } from '@/contexts/AcessoContext'
import { BRAND_LIST } from '@/constants/brands'
import { ABAS, ACOES } from '@/lib/permissoes'
import { fmtUltimoAcesso, statusDoUsuario, type StatusUsuario } from '@/lib/acessosAdmin'
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

const FILTROS: { chave: StatusUsuario | 'todos'; label: string }[] = [
  { chave: 'todos', label: 'Todos' },
  { chave: 'ativo', label: 'Ativos' },
  { chave: 'pendente', label: 'Nunca entraram' },
  { chave: 'desativado', label: 'Desativados' },
  { chave: 'sem-acesso', label: 'Sem acesso' },
]

function pill(bg: string, fg: string): CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg, whiteSpace: 'nowrap' }
}

const selectStyle: CSSProperties = { ...inputStyle, padding: '6px 8px', maxWidth: 220, width: '100%' }
const th: CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', padding: '10px 12px', whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }

function botaoTexto(cor: string): CSSProperties {
  return { border: 'none', background: 'none', padding: '6px 4px', fontSize: 13, fontWeight: 600, color: cor, cursor: 'pointer', fontFamily: 'var(--font-body)' }
}

function marcaLabel(slug: string | null): string {
  if (!slug) return 'todas as marcas'
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
function AbaUsuarios({ usuarios, papeis, carregando, erro, meuId, onAviso, onMudou }: {
  usuarios: UsuarioAcesso[]
  papeis: PapelAcesso[]
  carregando: boolean
  erro: string | null
  meuId: string | null
  onAviso: (a: Aviso) => void
  onMudou: () => Promise<void>
}) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<StatusUsuario | 'todos'>('todos')
  const [convidando, setConvidando] = useState(false)
  const [desativando, setDesativando] = useState<UsuarioAcesso | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const papelPorId = useMemo(() => new Map(papeis.map(p => [p.id, p])), [papeis])

  const contagem = useMemo(() => {
    const c: Record<StatusUsuario | 'todos', number> = { todos: usuarios.length, ativo: 0, pendente: 0, desativado: 0, 'sem-acesso': 0 }
    for (const u of usuarios) c[statusDoUsuario(u)] += 1
    return c
  }, [usuarios])

  const termo = busca.trim().toLowerCase()
  const visiveis = usuarios.filter(u =>
    (filtro === 'todos' || statusDoUsuario(u) === filtro) && (termo === '' || u.email.toLowerCase().includes(termo)))

  async function mudarPapel(u: UsuarioAcesso, papelId: string) {
    const papel = papelPorId.get(papelId)
    if (!papel || papelId === u.papelId) return
    const marca = papel.acessoTotal ? null : u.marca
    setOcupado(u.usuarioId)
    const falha = u.papelId
      ? await alterarAcessoUsuario(u.usuarioId, papelId, marca)
      : (await chamarGerenciarUsuarios({ acao: 'definir_acesso', usuarioId: u.usuarioId, papelId, marca })).error
    setOcupado(null)
    if (falha) { onAviso({ tipo: 'erro', texto: falha }); return }
    onAviso({ tipo: 'sucesso', texto: `${u.email} agora tem o acesso "${papel.nome}".` })
    await onMudou()
  }

  async function mudarMarca(u: UsuarioAcesso, marca: string | null) {
    if (!u.papelId) return
    setOcupado(u.usuarioId)
    const falha = await alterarAcessoUsuario(u.usuarioId, u.papelId, marca)
    setOcupado(null)
    if (falha) { onAviso({ tipo: 'erro', texto: falha }); return }
    onAviso({ tipo: 'sucesso', texto: marca ? `${u.email} agora só vê ${marcaLabel(marca)}.` : `${u.email} agora vê todas as marcas.` })
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

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-secondary)' }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por e-mail"
            aria-label="Buscar por e-mail"
            style={{ ...inputStyle, width: '100%', padding: '8px 10px 8px 32px' }}
          />
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={() => setConvidando(true)} disabled={papeis.length === 0} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <UserPlus size={16} /> Convidar pessoa
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTROS.filter(f => f.chave === 'todos' || contagem[f.chave] > 0).map(f => {
          const ativo = filtro === f.chave
          return (
            <button key={f.chave} onClick={() => setFiltro(f.chave)} aria-pressed={ativo} style={{
              padding: '4px 11px', borderRadius: 999, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
              border: `1px solid ${ativo ? 'var(--ws-text-primary)' : 'var(--ws-border)'}`,
              background: ativo ? 'var(--ws-text-primary)' : 'transparent',
              color: ativo ? 'var(--ws-surface)' : 'var(--ws-text-secondary)',
            }}>
              {f.label} <strong style={{ fontWeight: 600 }}>{contagem[f.chave]}</strong>
            </button>
          )
        })}
      </div>

      {carregando ? (
        <div style={{ padding: 24, fontSize: 13, color: 'var(--ws-text-secondary)' }}>Carregando usuários…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 780 }}>
            <thead>
              <tr>
                <th style={th}>Pessoa</th>
                <th style={th}>Tipo de acesso</th>
                <th style={th}>Marca</th>
                <th style={th}>Situação</th>
                <th style={th}>Último acesso</th>
                <th style={th}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(u => {
                const status = STATUS_VISUAL[statusDoUsuario(u)]
                const eu = u.usuarioId === meuId
                const papel = u.papelId ? papelPorId.get(u.papelId) : undefined
                const trabalhando = ocupado === u.usuarioId
                const marcaDesconhecida = u.marca !== null && !BRAND_LIST.some(b => b.key === u.marca)
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
                      <select
                        value={u.marca ?? ''}
                        disabled={eu || trabalhando || !papel || papel.acessoTotal}
                        title={papel?.acessoTotal ? 'Administrador sempre vê todas as marcas.' : undefined}
                        onChange={e => mudarMarca(u, e.target.value || null)}
                        aria-label={`Marca de ${u.email}`}
                        style={selectStyle}
                      >
                        <option value="">Todas as marcas</option>
                        {marcaDesconhecida && <option value={u.marca!}>{u.marca}</option>}
                        {BRAND_LIST.map(b => <option key={b.key} value={b.key}>Só {b.label}</option>)}
                      </select>
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
                <tr><td colSpan={6} style={{ ...td, padding: 24, color: 'var(--ws-text-secondary)' }}>Ninguém encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--ws-text-secondary)', margin: '14px 0 0', lineHeight: 1.5 }}>
        Quem fica travado numa marca só vê Visão Geral e Saúde da Marca dela, mesmo que o tipo de acesso libere outras telas.
      </p>

      {convidando && (
        <ModalConvite
          papeis={papeis}
          onFechar={() => setConvidando(false)}
          onConvidado={async texto => { setConvidando(false); onAviso({ tipo: 'sucesso', texto }); await onMudou() }}
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

function ModalConvite({ papeis, onFechar, onConvidado }: {
  papeis: PapelAcesso[]
  onFechar: () => void
  onConvidado: (texto: string) => void
}) {
  const [email, setEmail] = useState('')
  const [papelId, setPapelId] = useState('')
  const [marca, setMarca] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const papel = papeis.find(p => p.id === papelId)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!papel) { setErro('Escolha o tipo de acesso.'); return }
    setEnviando(true)
    const destino = email.trim()
    const r = await chamarGerenciarUsuarios({
      acao: 'convidar',
      email: destino,
      papelId: papel.id,
      marca: papel.acessoTotal ? null : (marca || null),
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
          <label style={label}>
            Marca
            <select value={marca} onChange={e => setMarca(e.target.value)} style={{ ...inputStyle, padding: '9px 12px', fontSize: 14 }}>
              <option value="">Todas as marcas</option>
              {BRAND_LIST.map(b => <option key={b.key} value={b.key}>Só {b.label}</option>)}
            </select>
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ws-text-secondary)' }}>Use pra quem é de fora, como franqueados: a pessoa só vê a própria marca.</span>
          </label>
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

  const grupos: { titulo: string; itens: { chave: string; label: string; descricao?: string }[] }[] = [
    { titulo: 'Telas de Marketing', itens: ABAS.filter(a => a.area === 'Marketing') },
    { titulo: 'Telas de Vendas', itens: ABAS.filter(a => a.area === 'Vendas') },
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 20 }}>
          {grupos.map(g => {
            const chaves = g.itens.map(i => i.chave)
            const todas = chaves.every(c => marcadas.has(c))
            return (
              <fieldset key={g.titulo} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
                <legend style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', width: '100%', marginBottom: 8, padding: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)' }}>{g.titulo}</span>
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
