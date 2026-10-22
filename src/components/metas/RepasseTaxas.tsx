import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, History, Plus } from 'lucide-react'
import { BRAND_LIST, marcaLabel } from '@/constants/brands'
import { useAcesso } from '@/contexts/AcessoContext'
import { publicarRepasse, useRepasseTaxas } from '@/hooks/useRepasseTaxas'
import { diffVersoes, versaoNoDia, type VersaoRepasse } from '@/lib/repasse'
import { CampoNumero } from './CampoNumero'
import {
  bannerStyle, cardStyle, disabledButtonStyle, infoBoxStyle, inputStyle, pillStyle, primaryButtonStyle,
  secondaryButtonStyle, sectionTitleStyle,
} from './metasUi'

/**
 * Configuração do repasse da taxa de franquia: quanto de cada venda fica com a
 * We Scale e quanto vai pra marca. Cada versão vale a partir de uma data; as
 * vendas usam a versão vigente na data da venda, então o histórico não muda.
 * Regra de cálculo em `src/lib/repasse.ts`.
 */

const COR_WS = 'var(--brand-accent)'
const COR_MARCA = 'var(--ws-border-strong)'

function hojeIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function fmtDia(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function diaAnterior(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA')
}

function diaSeguinte(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA')
}

function fmtPct(n: number): string {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

const th: CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ws-text-secondary)', textTransform: 'uppercase',
  letterSpacing: '.04em', padding: '8px 10px', borderBottom: '1px solid var(--ws-border)', whiteSpace: 'nowrap',
}
const td: CSSProperties = { padding: '10px', borderBottom: '1px solid var(--ws-border)', fontSize: 13, whiteSpace: 'nowrap' }

function BarraDivisao({ pct }: { pct: number }) {
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: COR_MARCA, minWidth: 120 }}>
      <div style={{ width: `${pct}%`, background: COR_WS }} />
    </div>
  )
}

function TabelaVersao({ versao }: { versao: VersaoRepasse }) {
  return (
    <div className="rs-scroll-x">
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            <th style={th}>Marca</th>
            <th style={{ ...th, textAlign: 'right' }}>Fica com a We Scale</th>
            <th style={{ ...th, textAlign: 'right' }}>Vai pra marca</th>
            <th style={{ ...th, width: '35%' }} />
          </tr>
        </thead>
        <tbody>
          {BRAND_LIST.map(b => {
            const cadastrado = b.marca ? versao.pctPorMarca.get(b.marca) : undefined
            const pct = cadastrado ?? 100
            return (
              <tr key={b.key}>
                <td style={td}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: b.accent }} />
                    {b.label}
                    {cadastrado == null && <span style={pillStyle('neutro')}>sem cadastro · conta 100%</span>}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(pct)}</td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(100 - pct)}</td>
                <td style={td}><BarraDivisao pct={pct} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function RepasseTaxas() {
  const { versoes, loading, error, reload } = useRepasseTaxas()
  const podeEditar = useAcesso().pode('acao.repasse-editar')
  const [editando, setEditando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [verVersao, setVerVersao] = useState<number | null>(null)

  const hoje = hojeIso()
  const vigente = versaoNoDia(versoes, hoje)
  const agendadas = versoes.filter(v => v.vigenteDesde > hoje)
  const ultima = versoes[versoes.length - 1] ?? null

  if (loading) return <div style={{ ...cardStyle, color: 'var(--ws-text-secondary)' }}>Carregando…</div>
  if (error) return <div style={bannerStyle('erro')}>Não foi possível carregar o repasse: {error}</div>

  if (editando) {
    return (
      <EditorVersao
        base={ultima}
        onCancelar={() => setEditando(false)}
        onPublicado={msg => { setEditando(false); setAviso(msg); reload() }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={infoBoxStyle}>
        Da taxa de franquia de cada venda, uma parte fica com a We Scale e o resto vai pra marca. Cada versão vale
        a partir de uma data, e <b>cada venda usa a versão que valia no dia em que foi fechada</b>: publicar uma
        versão nova não muda o que já foi vendido antes dela.
      </div>

      {aviso && <div style={bannerStyle('sucesso')}>{aviso}</div>}

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h3 style={sectionTitleStyle}>Em vigor hoje</h3>
            {vigente
              ? <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: -6 }}>
                  V{vigente.numero} · vale desde {fmtDia(vigente.vigenteDesde)}{vigente.motivo ? ` · ${vigente.motivo}` : ''}
                </div>
              : <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: -6 }}>
                  Nenhuma versão cadastrada: todas as vendas contam 100% We Scale.
                </div>}
          </div>
          {podeEditar && (
            <button type="button" style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setAviso(null); setEditando(true) }}>
              <Plus size={15} /> Nova versão
            </button>
          )}
        </div>
        {vigente && <TabelaVersao versao={vigente} />}
        {agendadas.length > 0 && (
          <div style={{ ...bannerStyle('atencao'), marginTop: 14 }}>
            Já publicada para o futuro: {agendadas.map(v => `V${v.numero} a partir de ${fmtDia(v.vigenteDesde)}`).join(' · ')}.
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}><History size={16} /> Histórico de versões</h3>
        {versoes.length === 0 && <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>Nenhuma versão publicada.</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[...versoes].reverse().map(v => {
            const i = versoes.indexOf(v)
            const anterior = i > 0 ? versoes[i - 1] : null
            const proxima = versoes[i + 1] ?? null
            const mudancas = diffVersoes(anterior, v)
            const aberta = verVersao === v.id
            const status = v === vigente ? 'Em vigor' : v.vigenteDesde > hoje ? 'Agendada' : 'Encerrada'
            return (
              <div key={v.id} style={{ padding: '14px 0', borderTop: '1px solid var(--ws-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14 }}>V{v.numero}</b>
                  <span style={pillStyle(status === 'Em vigor' ? 'sucesso' : status === 'Agendada' ? 'atencao' : 'neutro')}>{status}</span>
                  <span style={{ fontSize: 13, color: 'var(--ws-text-primary)' }}>
                    {i === 0
                      ? (proxima ? `Vendas até ${fmtDia(diaAnterior(proxima.vigenteDesde))}` : 'Todas as vendas')
                      : `Vendas de ${fmtDia(v.vigenteDesde)} ${proxima ? `a ${fmtDia(diaAnterior(proxima.vigenteDesde))}` : 'em diante'}`}
                  </span>
                  <button type="button" onClick={() => setVerVersao(aberta ? null : v.id)}
                    style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--brand-accent)' }}>
                    {aberta ? 'Esconder' : 'Ver percentuais'}
                  </button>
                </div>
                {v.motivo && <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)', marginTop: 4 }}>{v.motivo}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
                  Publicada{v.criadoPor ? ` por ${v.criadoPor}` : ''} em {new Date(v.criadoEm).toLocaleDateString('pt-BR')}
                </div>
                {anterior && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {mudancas.length === 0
                      ? <span style={pillStyle('neutro')}>Mesmos percentuais da V{anterior.numero}</span>
                      : mudancas.map(m => (
                          <span key={m.marca} style={pillStyle('destaque')}>
                            {marcaLabel(m.marca)}: {fmtPct(m.de)} <ArrowRight size={11} /> {fmtPct(m.para)}
                          </span>
                        ))}
                  </div>
                )}
                {aberta && <div style={{ marginTop: 12 }}><TabelaVersao versao={v} /></div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EditorVersao({ base, onCancelar, onPublicado }: {
  base: VersaoRepasse | null
  onCancelar: () => void
  onPublicado: (msg: string) => void
}) {
  const hoje = hojeIso()
  const minimo = base ? diaSeguinte(base.vigenteDesde) : '2025-01-01'
  const [vigenteDesde, setVigenteDesde] = useState(() => (hoje >= minimo ? hoje : minimo))
  const [motivo, setMotivo] = useState('')
  const [pcts, setPcts] = useState<Record<string, number | null>>(() => Object.fromEntries(
    BRAND_LIST.flatMap(b => (b.marca ? [[b.marca, base?.pctPorMarca.get(b.marca) ?? 100]] : [])),
  ))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const mudancas = useMemo(() => BRAND_LIST.filter(b => b.marca && (pcts[b.marca] ?? 100) !== (base?.pctPorMarca.get(b.marca) ?? 100)), [pcts, base])
  const faltaPct = Object.values(pcts).some(v => v == null)
  const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde) && vigenteDesde >= minimo
  const pronto = dataValida && motivo.trim() !== '' && !faltaPct && !salvando

  async function publicar() {
    if (!pronto) return
    setSalvando(true)
    setErro(null)
    const r = await publicarRepasse({
      vigenteDesde,
      motivo: motivo.trim(),
      marcas: Object.entries(pcts).map(([marca, pct]) => ({ marca, pctWeScale: pct ?? 100 })),
    })
    setSalvando(false)
    if (!r.ok) { setErro(r.error ?? 'não foi possível publicar'); return }
    onPublicado(`V${r.numero ?? ''} publicada. Vendas a partir de ${fmtDia(vigenteDesde)} passam a usar esses percentuais.`)
  }

  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h3 style={sectionTitleStyle}>Nova versão do repasse{base ? ` (V${base.numero + 1})` : ''}</h3>
        <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)', marginTop: -6 }}>
          Começa com os percentuais da versão atual. Mude só o que mudou: depois de publicada, a versão não pode ser editada.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
          Vale para vendas a partir de
          <input type="date" value={vigenteDesde} min={minimo} onChange={e => setVigenteDesde(e.target.value)}
            style={{ ...inputStyle, borderColor: dataValida ? undefined : 'var(--status-risco)' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ws-text-secondary)', flex: 1, minWidth: 240 }}>
          Motivo da mudança
          <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: novo contrato com a Inpot para 2027"
            style={inputStyle} />
        </label>
      </div>
      {!dataValida && base && (
        <div style={bannerStyle('erro')}>A data tem que ser depois de {fmtDia(base.vigenteDesde)}, quando começou a V{base.numero}.</div>
      )}
      {dataValida && vigenteDesde < hoje && (
        <div style={bannerStyle('atencao')}>
          Data no passado: as vendas fechadas de {fmtDia(vigenteDesde)} até hoje passam a usar os percentuais desta versão.
        </div>
      )}

      <div className="rs-scroll-x">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={th}>Marca</th>
              <th style={th}>Fica com a We Scale</th>
              <th style={{ ...th, textAlign: 'right' }}>Vai pra marca</th>
              <th style={{ ...th, textAlign: 'right' }}>Antes</th>
            </tr>
          </thead>
          <tbody>
            {BRAND_LIST.map(b => {
              if (!b.marca) return null
              const valor = pcts[b.marca]
              const antes = base?.pctPorMarca.get(b.marca) ?? 100
              const mudou = (valor ?? 100) !== antes
              return (
                <tr key={b.key} style={{ background: mudou ? 'color-mix(in srgb, var(--brand-accent) 6%, transparent)' : undefined }}>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: b.accent }} />{b.label}
                    </span>
                  </td>
                  <td style={td}>
                    <CampoNumero valor={valor} onMudar={v => setPcts(p => ({ ...p, [b.marca!]: v }))}
                      casas={2} passo={5} min={0} max={100} sufixo="%" largura={110} invalido={valor == null} />
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {valor == null ? '—' : fmtPct(100 - valor)}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {base ? fmtPct(antes) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {erro && <div style={bannerStyle('erro')}>{erro}</div>}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginRight: 'auto' }}>
          {mudancas.length === 0 ? 'Nenhum percentual mudou em relação à versão atual.' : `${mudancas.length} marca(s) com percentual novo.`}
        </span>
        <button type="button" style={secondaryButtonStyle} onClick={onCancelar} disabled={salvando}>Cancelar</button>
        <button type="button" style={pronto ? primaryButtonStyle : disabledButtonStyle} onClick={publicar} disabled={!pronto}>
          {salvando ? 'Publicando…' : 'Publicar versão'}
        </button>
      </div>
    </div>
  )
}
