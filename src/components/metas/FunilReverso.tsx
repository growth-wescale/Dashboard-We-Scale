import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, Flag, Phone } from 'lucide-react'
import {
  ETAPA_ABAIXO, ROTULO_ETAPA, definirModoEtapa,
  type EtapaCalculada, type EtapaConfiguravel, type EtapaMetaConfig, type FunilCalculado,
  type MarcaConfig, type ModoEtapaConfig, type ReferenciaMarca,
} from '@/lib/configMetas'
import { CampoNumero } from './CampoNumero'
import { capitalizar, fmtDec, fmtInt, fmtPct, pillStyle, type PillKind } from './metasUi'

/**
 * Ordem da tela: a partir das vendas (informadas logo acima, na Base do mês),
 * voltando etapa por etapa até o SQL; Ligações por último, fora da cadeia.
 * A conversão de cada etapa fica no conector ACIMA dela (entre ela e a etapa
 * de baixo do funil, que na tela aparece antes).
 */
const ORDEM_TELA: EtapaMetaConfig[] = ['Fechamento', 'Oportunidade COF', 'SAL', 'Reunião Realizada', 'Reunião Agendada SQL', 'Ligações']

const DONO: Record<EtapaMetaConfig, string> = {
  'Ligações': 'SDR', 'Reunião Agendada SQL': 'SDR', 'Reunião Realizada': 'SDR', SAL: 'SDR',
  'Oportunidade COF': 'Closer', Fechamento: 'Closer',
}

const SELO: Record<EtapaCalculada['origem'], { texto: string; kind: PillKind }> = {
  ancora: { texto: 'ponto de partida', kind: 'destaque' },
  referencia: { texto: 'calculado', kind: 'neutro' },
  conversao: { texto: 'calculado', kind: 'neutro' },
  manual: { texto: 'manual', kind: 'destaque' },
  sem_meta: { texto: 'sem meta', kind: 'neutro' },
}

/** Pisca o fundo quando o valor muda — deixa claro o que foi recalculado. */
function ValorAnimado({ valor, children }: { valor: number | null; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const anterior = useRef(valor)
  useEffect(() => {
    if (anterior.current === valor) return
    anterior.current = valor
    const el = ref.current
    if (!el) return
    el.classList.remove('cm-flash')
    void el.offsetWidth
    el.classList.add('cm-flash')
  }, [valor])
  return <span ref={ref} style={{ borderRadius: 6, padding: '0 6px' }}>{children}</span>
}

export function FunilReverso({ marca, funil, onMudar }: {
  marca: MarcaConfig
  funil: FunilCalculado
  onMudar: (m: MarcaConfig) => void
}) {
  // Antes das vendas, nada foi calculado ainda — apontar erro em cada etapa só assusta.
  const mostrarProblemas = marca.vendas != null
  const mudarModo = (etapa: EtapaConfiguravel, modo: ModoEtapaConfig) => onMudar(definirModoEtapa(marca, etapa, modo))
  // Escala da barrinha: a maior etapa do funil (Ligações tem ordem de grandeza própria).
  const escala = Math.max(1, ...ORDEM_TELA.filter(e => e !== 'Ligações').map(e => funil.etapas[e].meta ?? 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {ORDEM_TELA.map(etapa => (
        <Fragment key={etapa}>
          {etapa !== 'Fechamento' && (
            <Conector
              etapa={etapa}
              calc={funil.etapas[etapa]}
              modo={marca.etapas[etapa]}
              referencia={marca.referencia}
              onMudarModo={mudarModo}
            />
          )}
          <LinhaEtapa
            etapa={etapa}
            calc={funil.etapas[etapa]}
            modo={etapa === 'Fechamento' ? undefined : marca.etapas[etapa]}
            escala={etapa === 'Ligações' ? null : escala}
            onMudarModo={mudarModo}
            mostrarProblema={mostrarProblemas}
          />
        </Fragment>
      ))}
    </div>
  )
}

function LinhaEtapa({ etapa, calc, modo, escala, onMudarModo, mostrarProblema }: {
  etapa: EtapaMetaConfig
  calc: EtapaCalculada
  modo: ModoEtapaConfig | undefined
  escala: number | null
  onMudarModo: (etapa: EtapaConfiguravel, modo: ModoEtapaConfig) => void
  mostrarProblema: boolean
}) {
  const ancora = etapa === 'Fechamento'
  const ligacoes = etapa === 'Ligações'
  const semMeta = calc.origem === 'sem_meta'
  const selo = SELO[calc.origem]
  const detalhe = ancora ? ' · vem da Base do mês' : ligacoes ? ' · atividade, fora da cadeia de conversão' : ''
  const largura = escala && calc.meta != null ? Math.max(3, (calc.meta / escala) * 100) : 0

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px',
        borderRadius: 'var(--radius-sm)',
        border: ancora ? '1.5px solid var(--brand-accent)' : ligacoes ? '1px dashed var(--ws-border-strong)' : '1px solid var(--ws-border)',
        background: semMeta ? 'var(--ws-bg)' : 'var(--ws-surface)',
      }}>
        {ancora && <Flag size={16} color="var(--brand-accent)" aria-hidden />}
        {ligacoes && <Phone size={16} color="var(--ws-text-secondary)" aria-hidden />}
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: semMeta ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)' }}>
            {ROTULO_ETAPA[etapa]}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>meta do {DONO[etapa]}{detalhe}</div>
        </div>
        {escala != null && (
          <div className="cm-barra-funil" aria-hidden style={{ width: 140, height: 8, borderRadius: 4, background: 'var(--ws-bg)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${largura}%`, borderRadius: 4, transition: 'width .35s ease',
              background: ancora ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--brand-accent) 45%, var(--ws-surface))',
            }} />
          </div>
        )}
        <span style={pillStyle(selo.kind)}>{selo.texto}</span>
        {modo?.tipo === 'manual' ? (
          <CampoNumero
            valor={modo.valor}
            onMudar={v => onMudarModo(etapa as EtapaConfiguravel, { tipo: 'manual', valor: v })}
            passo={ligacoes ? 10 : 1}
            largura={80}
            destaque
            rotulo={`Número de ${ROTULO_ETAPA[etapa]}`}
          />
        ) : (
          <span style={{ fontSize: 22, fontWeight: 600, minWidth: 80, textAlign: 'right', color: semMeta ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)' }}>
            <ValorAnimado valor={calc.meta}>{calc.meta != null ? fmtInt(calc.meta) : '—'}</ValorAnimado>
          </span>
        )}
      </div>
      {mostrarProblema && calc.problema && (
        <div style={{ fontSize: 12, color: 'var(--status-risco)', padding: '4px 16px 0' }}>{calc.problema}</div>
      )}
    </div>
  )
}

function Conector({ etapa, calc, modo, referencia, onMudarModo }: {
  etapa: EtapaConfiguravel
  calc: EtapaCalculada
  modo: ModoEtapaConfig
  referencia: ReferenciaMarca | null
  onMudarModo: (etapa: EtapaConfiguravel, modo: ModoEtapaConfig) => void
}) {
  const [focarTaxa, setFocarTaxa] = useState(false)
  const abaixo = ETAPA_ABAIXO[etapa]
  const refTaxa = referencia?.taxas[etapa] ?? null

  let texto: string
  if (modo.tipo === 'sem_meta') texto = `${ROTULO_ETAPA[etapa]}: sem meta nesta etapa`
  else if (calc.taxa == null) texto = `${ROTULO_ETAPA[etapa]} → ${ROTULO_ETAPA[abaixo]}: sem conversão`
  else {
    texto = `${ROTULO_ETAPA[etapa]} → ${ROTULO_ETAPA[abaixo]}: ${fmtPct(calc.taxa)}`
    if (etapa === 'Ligações') texto += ` · 1 SQL a cada ${fmtDec(1 / calc.taxa)} ligações`
    if (modo.tipo === 'manual') texto = `resultante — ${texto}`
  }

  const opcoes: { tipo: ModoEtapaConfig['tipo']; rotulo: string; desabilitada: boolean }[] = [
    {
      tipo: 'referencia',
      rotulo: refTaxa != null && referencia ? `${capitalizar(referencia.rotulo)} ${fmtPct(refTaxa)}` : 'Sem referência',
      desabilitada: refTaxa == null,
    },
    { tipo: 'conversao', rotulo: 'Nova conversão', desabilitada: false },
    { tipo: 'manual', rotulo: 'Número manual', desabilitada: false },
    { tipo: 'sem_meta', rotulo: 'Sem meta', desabilitada: false },
  ]

  function escolher(tipo: ModoEtapaConfig['tipo']) {
    if (tipo === modo.tipo) return
    setFocarTaxa(tipo === 'conversao')
    if (tipo === 'referencia') onMudarModo(etapa, { tipo: 'referencia' })
    else if (tipo === 'conversao') onMudarModo(etapa, { tipo: 'conversao', taxa: calc.taxa ?? refTaxa })
    else if (tipo === 'manual') onMudarModo(etapa, { tipo: 'manual', valor: calc.meta })
    else onMudarModo(etapa, { tipo: 'sem_meta' })
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap',
      margin: '0 0 0 26px', padding: '10px 0 10px 18px', borderLeft: '2px solid var(--ws-border)',
    }}>
      <ArrowDown size={14} color="var(--ws-text-secondary)" aria-hidden />
      <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', flex: '1 1 200px', minWidth: 0 }}>{texto}</span>
      <div className="cm-seg" role="group" aria-label={`Como definir ${ROTULO_ETAPA[etapa]}`} style={{
        display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--ws-border-strong)',
        borderRadius: 'var(--radius-sm)', overflow: 'hidden',
      }}>
        {opcoes.map((o, i) => {
          const ativo = modo.tipo === o.tipo
          return (
            <button
              key={o.tipo}
              type="button"
              aria-pressed={ativo}
              disabled={o.desabilitada}
              onClick={() => escolher(o.tipo)}
              style={{
                border: 'none', borderRight: i < opcoes.length - 1 ? '1px solid var(--ws-border)' : 'none',
                padding: '5px 10px', fontSize: 12, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                cursor: o.desabilitada ? 'not-allowed' : 'pointer',
                background: ativo ? 'color-mix(in srgb, var(--brand-accent) 12%, var(--ws-surface))' : 'var(--ws-surface)',
                color: ativo ? 'var(--brand-accent)' : o.desabilitada ? 'var(--ws-border-strong)' : 'var(--ws-text-primary)',
                fontWeight: ativo ? 600 : 400,
              }}
            >
              {o.rotulo}
            </button>
          )
        })}
      </div>
      {modo.tipo === 'conversao' && (
        <CampoNumero
          casas={1}
          passo={1}
          max={100}
          sufixo="%"
          largura={56}
          autoFocus={focarTaxa}
          valor={modo.taxa != null ? modo.taxa * 100 : null}
          onMudar={v => onMudarModo(etapa, { tipo: 'conversao', taxa: v == null ? null : v / 100 })}
          rotulo={`Conversão ${ROTULO_ETAPA[etapa]} → ${ROTULO_ETAPA[abaixo]}`}
        />
      )}
      {calc.alterada && refTaxa != null && (
        <span style={pillStyle('atencao')}>alterada · era {fmtPct(refTaxa)}</span>
      )}
    </div>
  )
}
