import { useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Eraser, Minus, Plus, Sparkles, Users } from 'lucide-react'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { gerarSemanas, type DiaSemana, type Semana } from '@/lib/metasEngine'
import {
  ETAPAS_CLOSER, ETAPAS_SDR, ROTULO_ETAPA, calcularFunil, diasDaSemana, distribuirVendasProporcional, metasDaSemana,
  vendasDistribuidas, type EtapaMetaConfig, type MarcaConfig, type RascunhoConfig, type VendaSemana,
} from '@/lib/configMetas'
import {
  cardStyle, fmtDec, fmtInt, ghostButtonStyle, infoBoxStyle, inputStyle, pillStyle, primaryButtonStyle,
  secondaryButtonStyle, smallButtonStyle,
} from './metasUi'
import './metas.css'

const DIAS: DiaSemana[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']
const DIA_LABEL: Record<DiaSemana, string> = {
  segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo',
}

/** Etapas derivadas mostradas embaixo de cada semana, na ordem do funil a partir das vendas. */
const DERIVADAS: EtapaMetaConfig[] = ['Oportunidade COF', 'SAL', 'Reunião Realizada', 'Reunião Agendada SQL', 'Ligações']

/** Acima disso a coluna mostra "× N" em vez de uma ficha por venda. */
const MAX_FICHAS = 12

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function PassoSemanas({ rascunho, onMudar, onVoltar, onAvancar }: {
  rascunho: RascunhoConfig
  onMudar: (r: RascunhoConfig) => void
  onVoltar: () => void
  onAvancar: () => void
}) {
  const { semanas } = rascunho
  const comVendas = rascunho.marcas.filter(m => (m.vendas ?? 0) > 0)
  const situacoes = comVendas.map(m => vendasDistribuidas(rascunho, m.marca).situacao)
  const prontas = situacoes.filter(s => s === 'completo').length
  const pelaMetade = situacoes.filter(s => s === 'parcial' || s === 'excedido').length

  const mudarVendas = (vendasPorSemana: VendaSemana[]) => onMudar({ ...rascunho, vendasPorSemana })

  function distribuirTodas() {
    if (rascunho.vendasPorSemana.length > 0 && !window.confirm('Refazer a distribuição de todas as marcas proporcional aos dias? O que já foi distribuído à mão será substituído.')) return
    let r = rascunho
    for (const m of comVendas) r = { ...r, vendasPorSemana: distribuirVendasProporcional(r, m.marca) }
    mudarVendas(r.vendasPorSemana)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CalendarDays size={13} /> A semana começa na
            </span>
            <select
              value={rascunho.diaViradaSemana}
              onChange={e => {
                const dia = e.target.value as DiaSemana
                const novas = gerarSemanas(rascunho.mesReferencia, dia)
                onMudar({ ...rascunho, diaViradaSemana: dia, semanas: novas, vendasPorSemana: rascunho.vendasPorSemana.filter(v => v.semanaNumero <= novas.length) })
              }}
              style={{ ...inputStyle, padding: '8px 10px', cursor: 'pointer' }}
            >
              {DIAS.map(d => <option key={d} value={d}>{DIA_LABEL[d]}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {semanas.map(s => (
              <span key={s.numero} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--ws-bg)' }}>
                <b>S{s.numero}</b> {ddmm(s.inicio)}–{ddmm(s.fim)} · {diasDaSemana(s)} dias
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...infoBoxStyle, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ flex: '1 1 320px', minWidth: 0 }}>
          <b>Distribua só as vendas.</b> Oportunidade, SAL, Diagnóstico, SQL e Ligações de cada semana vêm junto, na mesma proporção,
          e cada pessoa recebe a parte dela pelo peso. É opcional — mas quando começar numa marca, feche todas as vendas dela.
        </span>
        {comVendas.length > 0 && (
          <span style={pillStyle(pelaMetade > 0 ? 'atencao' : prontas === comVendas.length ? 'sucesso' : 'neutro')}>
            {prontas} de {comVendas.length} marcas distribuídas
          </span>
        )}
        {comVendas.length > 0 && (
          <button type="button" onClick={distribuirTodas} style={{ ...smallButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} /> Distribuir todas pelos dias
          </button>
        )}
      </div>

      {rascunho.marcas.map(m => (
        <CartaoMarcaSemanas key={m.marca} rascunho={rascunho} marca={m} semanas={semanas} onVendas={mudarVendas} />
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onVoltar} style={{ ...secondaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}><ArrowLeft size={14} /> Marcas</button>
        <button type="button" onClick={onAvancar} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>Revisar e publicar <ArrowRight size={14} /></button>
      </div>
    </div>
  )
}

function Ficha({ cor, vazia = false, onClick, titulo }: { cor: string; vazia?: boolean; onClick?: () => void; titulo?: string }) {
  const estilo = {
    width: 16, height: 16, borderRadius: '50%', flexShrink: 0, padding: 0,
    background: vazia ? 'transparent' : cor,
    border: `2px ${vazia ? 'dashed' : 'solid'} ${cor}`,
    boxShadow: vazia ? 'none' : `0 1px 2px color-mix(in srgb, ${cor} 40%, transparent)`,
  } as const
  if (!onClick) return <span aria-hidden style={estilo} />
  return <button type="button" className="cm-ficha" title={titulo} aria-label={titulo} onClick={onClick} style={{ ...estilo, cursor: 'pointer' }} />
}

function CartaoMarcaSemanas({ rascunho, marca, semanas, onVendas }: {
  rascunho: RascunhoConfig
  marca: MarcaConfig
  semanas: Semana[]
  onVendas: (v: VendaSemana[]) => void
}) {
  const [verPessoas, setVerPessoas] = useState(false)
  const cor = BRAND_ACCENT[marca.marca] ?? 'var(--brand-accent)'
  const nome = marcaLabel(marca.marca)
  const { porSemana, distribuido, total, situacao } = vendasDistribuidas(rascunho, marca.marca)
  const restante = Math.max(0, total - distribuido)

  if (situacao === 'sem_vendas') {
    return (
      <div style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: cor }} aria-hidden />
        <b style={{ fontSize: 14 }}>{nome}</b>
        <span style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>sem vendas no mês — nada a distribuir</span>
      </div>
    )
  }

  const funil = calcularFunil(marca)
  const derivadas = DERIVADAS.filter(e => funil.etapas[e].meta != null)

  function definir(semanaNumero: number, valor: number) {
    const resto = rascunho.vendasPorSemana.filter(v => !(v.marca === marca.marca && v.semanaNumero === semanaNumero))
    onVendas(valor > 0 ? [...resto, { marca: marca.marca, semanaNumero, valor }] : resto)
  }

  const status = situacao === 'completo'
    ? <span style={pillStyle('sucesso')}><Check size={11} /> todas as {fmtInt(total)} distribuídas</span>
    : situacao === 'vazio'
      ? <span style={pillStyle('neutro')}>em branco · opcional</span>
      : situacao === 'excedido'
        ? <span style={pillStyle('erro')}>passou {fmtDec(distribuido - total)} do mês</span>
        : <span style={pillStyle('atencao')}>faltam {fmtDec(restante)} de {fmtInt(total)}</span>

  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: cor }} aria-hidden />
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{nome}</h3>
        <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{fmtInt(total)} {total === 1 ? 'venda' : 'vendas'} no mês</span>
        {status}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => onVendas(distribuirVendasProporcional(rascunho, marca.marca))} style={{ ...ghostButtonStyle, fontSize: 12 }}>
          <Sparkles size={13} /> Proporcional aos dias
        </button>
        {distribuido > 0 && (
          <button type="button" onClick={() => onVendas(rascunho.vendasPorSemana.filter(v => v.marca !== marca.marca))} style={{ ...ghostButtonStyle, fontSize: 12 }}>
            <Eraser size={13} /> Limpar
          </button>
        )}
      </div>

      {/* Monte de vendas ainda sem semana */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 12,
        borderRadius: 'var(--radius-sm)', border: `1.5px dashed ${restante > 0 ? cor : 'var(--ws-border)'}`,
        background: restante > 0 ? `color-mix(in srgb, ${cor} 6%, var(--ws-surface))` : 'var(--ws-bg)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-secondary)' }}>A distribuir</span>
        {restante > 0 ? (
          <>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {Array.from({ length: Math.min(Math.ceil(restante), MAX_FICHAS) }, (_, i) => <Ficha key={i} cor={cor} />)}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtDec(restante)}</span>
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>use o ＋ de cada semana</span>
          </>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--status-positivo)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={14} /> nenhuma venda sobrando
          </span>
        )}
      </div>

      <div className="rs-scroll-x">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${semanas.length}, minmax(132px, 1fr))`, gap: 10, minWidth: semanas.length * 142 }}>
          {semanas.map((s, i) => {
            const valor = porSemana[i]
            const semana = metasDaSemana(marca, valor, funil)
            const ativa = valor > 0
            return (
              <div key={s.numero} style={{
                borderRadius: 'var(--radius-sm)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
                border: `1.5px solid ${ativa ? cor : 'var(--ws-border)'}`,
                background: ativa ? `color-mix(in srgb, ${cor} 5%, var(--ws-surface))` : 'var(--ws-surface)',
                transition: 'border-color .2s, background .2s',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>S{s.numero}</div>
                  <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{ddmm(s.inicio)}–{ddmm(s.fim)} · {diasDaSemana(s)}d</div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 38, alignContent: 'flex-start' }}>
                  {valor > MAX_FICHAS
                    ? <><Ficha cor={cor} /><span style={{ fontSize: 12, fontWeight: 600 }}>× {fmtDec(valor)}</span></>
                    : Array.from({ length: Math.ceil(valor) }, (_, k) => (
                      <Ficha key={k} cor={cor} titulo={`Devolver 1 venda da S${s.numero}`} onClick={() => definir(s.numero, Math.max(0, valor - 1))} />
                    ))}
                  {valor === 0 && <Ficha cor="var(--ws-border-strong)" vazia />}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <button type="button" className="cm-passo" aria-label={`Tirar 1 venda da S${s.numero}`} disabled={valor <= 0}
                    onClick={() => definir(s.numero, Math.max(0, valor - 1))}>
                    <Minus size={14} />
                  </button>
                  <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: ativa ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)' }}>{fmtDec(valor)}</span>
                  <button type="button" className="cm-passo" aria-label={`Colocar 1 venda na S${s.numero}`} disabled={restante <= 0}
                    onClick={() => definir(s.numero, valor + Math.min(1, restante))}>
                    <Plus size={14} />
                  </button>
                </div>

                <div style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {derivadas.map(e => (
                    <div key={e} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12 }}>
                      <span style={{ color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap' }}>{ROTULO_ETAPA[e]}</span>
                      <b style={{ color: ativa ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)', fontWeight: ativa ? 600 : 400 }}>
                        {ativa ? fmtDec(semana[e] ?? 0) : '—'}
                      </b>
                    </div>
                  ))}
                  {derivadas.length === 0 && <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>só meta de vendas</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {distribuido > 0 && marca.pessoas.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setVerPessoas(v => !v)} aria-expanded={verPessoas} style={{ ...ghostButtonStyle, fontSize: 12, padding: '4px 0' }}>
            <Users size={13} /> {verPessoas ? 'Esconder' : 'Ver'} a meta de cada pessoa por semana
            <ChevronDown size={13} style={{ transform: verPessoas ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>
          {verPessoas && <TabelaPessoas marca={marca} semanas={semanas} porSemana={porSemana} />}
        </div>
      )}
    </div>
  )
}

function TabelaPessoas({ marca, semanas, porSemana }: { marca: MarcaConfig; semanas: Semana[]; porSemana: number[] }) {
  const funil = calcularFunil(marca)
  const porSemanaMetas = porSemana.map(v => metasDaSemana(marca, v, funil))
  const linhas = marca.pessoas.flatMap(p => (p.funcao === 'SDR' ? ETAPAS_SDR : ETAPAS_CLOSER)
    .filter(e => funil.etapas[e].meta != null)
    .map(e => ({ pessoa: p, etapa: e })))
  const th = { padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--ws-text-secondary)', textAlign: 'right' as const, whiteSpace: 'nowrap' as const }
  const td = { padding: '6px 8px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const }
  return (
    <div className="rs-scroll-x" style={{ marginTop: 8 }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 220 + semanas.length * 70 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Pessoa · etapa</th>
            {semanas.map(s => <th key={s.numero} style={th}>S{s.numero}</th>)}
            <th style={th}>Mês</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ pessoa, etapa }) => {
            const valores = porSemanaMetas.map(m => ((m[etapa] ?? 0) * pessoa.peso) / 100)
            return (
              <tr key={`${pessoa.nome}|${etapa}`} style={{ borderTop: '1px solid var(--ws-border)' }}>
                <td style={{ ...td, textAlign: 'left' }}>
                  <b>{pessoa.nome}</b> <span style={{ color: 'var(--ws-text-secondary)' }}>· {ROTULO_ETAPA[etapa]}</span>
                </td>
                {valores.map((v, i) => <td key={i} style={{ ...td, color: v > 0 ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)' }}>{v > 0 ? fmtDec(v) : '—'}</td>)}
                <td style={{ ...td, fontWeight: 600 }}>{fmtDec(valores.reduce((a, b) => a + b, 0))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
