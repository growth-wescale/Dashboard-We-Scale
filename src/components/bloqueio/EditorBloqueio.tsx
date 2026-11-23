import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { bannerStyle, disabledButtonStyle, inputStyle, primaryButtonStyle, secondaryButtonStyle } from '@/components/metas/metasUi'
import { botaoTexto } from '@/components/distribuicao/ui'
import { useHistoricoLead } from '@/hooks/useHistoricoLead'
import type { SalvarBloqueioInput } from '@/hooks/useGravarBloqueio'
import {
  acaoDaMudanca, diffMarcas, emailValido, normalizarEmail, resumoOndeApareceu, textoMarcas,
  type AcaoBloqueio, type BloqueioRow, type MarcaBloqueio,
} from '@/lib/distribuicao/bloqueio'

// Modal de bloquear / editar marcas / desbloquear. O motivo é obrigatório em toda ação (vai pro
// histórico). O e-mail digitado que já está na lista abre com as marcas atuais dele.

export type ModoEditor = 'novo' | 'editar' | 'desbloquear'

interface Props {
  modo: ModoEditor
  /** E-mail já escolhido (editar/desbloquear); no modo novo começa vazio. */
  emailInicial: string
  marcas: MarcaBloqueio[]
  existentes: BloqueioRow[]
  onSalvar: (input: SalvarBloqueioInput) => Promise<string | null>
  onFechar: () => void
}

const TITULO: Record<ModoEditor, string> = { novo: 'Bloquear e-mail', editar: 'Editar marcas bloqueadas', desbloquear: 'Desbloquear e-mail' }
const BOTAO: Record<AcaoBloqueio, string> = { bloqueio: 'Bloquear', alteracao: 'Salvar alteração', desbloqueio: 'Desbloquear' }

export function EditorBloqueio({ modo, emailInicial, marcas, existentes, onSalvar, onFechar }: Props) {
  const [email, setEmail] = useState(emailInicial)
  const [emailConsulta, setEmailConsulta] = useState(emailInicial)
  const normal = normalizarEmail(email)
  const existente = useMemo(() => existentes.find(b => b.email === normal) ?? null, [existentes, normal])
  const antes = useMemo(() => existente?.marcas ?? [], [existente])
  const [selecionadas, setSelecionadas] = useState<string[]>(() => (modo === 'desbloquear' ? [] : antes))
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // No modo novo, e-mail que já está na lista abre com as marcas atuais (dá pra editar a partir delas).
  // A chave é texto: a recarga de 1 em 1 min traz objetos novos e não pode apagar o que foi marcado.
  const chaveExistente = existente ? `${existente.email}|${existente.marcas.join(',')}` : ''
  useEffect(() => {
    if (modo === 'novo') setSelecionadas(chaveExistente ? chaveExistente.slice(chaveExistente.lastIndexOf('|') + 1).split(',').filter(Boolean) : [])
  }, [modo, chaveExistente])

  // Esc fecha (menos no meio do salvamento).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !salvando) onFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [salvando, onFechar])

  // Consulta o histórico só quando a pessoa para de digitar.
  useEffect(() => {
    const t = setTimeout(() => setEmailConsulta(email), 400)
    return () => clearTimeout(t)
  }, [email])
  const hist = useHistoricoLead(emailConsulta)
  // Enquanto a consulta não é do e-mail que está no campo (espera da digitação ou carregando),
  // não mostra nem usa o resultado: podia ser de outro lead.
  const consultando = hist.loading || hist.email !== (emailValido(email) ? normalizarEmail(email) : null)

  const rotulo = useMemo(() => {
    const m = new Map(marcas.map(x => [x.marca, x.rotulo]))
    return (marca: string) => m.get(marca) ?? marca
  }, [marcas])
  const todas = marcas.map(m => m.marca)
  const apareceu = useMemo(() => resumoOndeApareceu(hist.conversoes, hist.negocios, rotulo), [hist.conversoes, hist.negocios, rotulo])
  const marcasOndeApareceu = marcas.filter(m => apareceu.some(a => a.rotulo === m.rotulo)).map(m => m.marca)

  const valido = emailValido(email)
  const acao = acaoDaMudanca(antes, selecionadas)
  const motivoOk = motivo.trim().length >= 3
  const pode = valido && acao !== null && motivoOk && !salvando
  const { adicionadas, removidas } = diffMarcas(antes, selecionadas)

  function alternar(marca: string) {
    setSelecionadas(s => (s.includes(marca) ? s.filter(x => x !== marca) : [...s, marca]))
  }

  async function salvar() {
    if (!pode) return
    setSalvando(true)
    setErro(null)
    const e = await onSalvar({ email: normal, marcas: selecionadas, marcasAntes: antes, motivo: motivo.trim() })
    setSalvando(false)
    if (e) setErro(e)
  }

  const rotuloCampo = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ws-text-secondary)', marginBottom: 6 } as const

  return (
    <div role="dialog" aria-modal="true" aria-label={TITULO[modo]} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, zIndex: 60, overflowY: 'auto' }}>
      <div style={{ background: 'var(--ws-surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md, 0 10px 30px rgba(0,0,0,.15))', width: 'min(640px, 100%)', padding: 24, marginTop: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{TITULO[modo]}</h2>
          <button type="button" aria-label="Fechar" onClick={onFechar} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary)' }}><X size={18} /></button>
        </div>

        <div>
          <label htmlFor="bloqueio-email" style={rotuloCampo}>E-mail do lead</label>
          <input id="bloqueio-email" type="email" autoComplete="off" style={{ ...inputStyle, width: '100%', padding: '8px 10px' }}
            value={email} disabled={modo !== 'novo'} placeholder="nome@exemplo.com"
            onChange={e => setEmail(e.target.value)} />
          {email && !valido && <div style={{ fontSize: 12, color: 'var(--status-risco)', marginTop: 4 }}>E-mail inválido.</div>}
          {modo === 'novo' && existente && (
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 6 }}>
              Este e-mail já está na lista ({existente.bloqueado ? `bloqueado em ${textoMarcas(existente.marcas, todas, rotulo)}` : 'desbloqueado'}). As marcas abaixo são as de agora.
            </div>
          )}
        </div>

        {valido && (
          <div style={{ background: 'var(--ws-bg)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            {consultando ? 'Procurando este e-mail…'
              : hist.error ? <span style={{ color: 'var(--status-risco)' }}>Não deu para consultar onde este e-mail apareceu: {hist.error}</span>
              : apareceu.length === 0 ? 'Nenhuma conversão (desde 16/10) nem negócio no RD com este e-mail.'
              : (
                <>
                  <div style={{ marginBottom: 4, color: 'var(--ws-text-primary)', fontWeight: 600 }}>Onde este e-mail já apareceu</div>
                  {apareceu.map(a => (
                    <div key={a.rotulo}>{a.rotulo}: {a.conversoes} {a.conversoes === 1 ? 'conversão' : 'conversões'} · {a.negocios} {a.negocios === 1 ? 'negócio' : 'negócios'} no RD</div>
                  ))}
                  {modo !== 'desbloquear' && marcasOndeApareceu.length > 0 && (
                    <button type="button" style={{ ...botaoTexto(), padding: '4px 0', marginTop: 4 }}
                      onClick={() => setSelecionadas(s => [...new Set([...s, ...marcasOndeApareceu])])}>
                      Marcar essas marcas
                    </button>
                  )}
                </>
              )}
          </div>
        )}

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ ...rotuloCampo, marginBottom: 0 }}>Bloquear nas marcas</span>
            <span style={{ display: 'inline-flex', gap: 4 }}>
              <button type="button" style={botaoTexto()} onClick={() => setSelecionadas(todas)}>Marcar todas</button>
              <button type="button" style={botaoTexto('var(--ws-text-secondary)')} onClick={() => setSelecionadas([])}>Limpar</button>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))', gap: 6 }}>
            {marcas.map(m => (
              <label key={m.marca} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: selecionadas.includes(m.marca) ? 'var(--status-risco-bg)' : undefined }}>
                <input type="checkbox" checked={selecionadas.includes(m.marca)} onChange={() => alternar(m.marca)} />
                {m.rotulo}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 6 }}>
            {acao === null ? (antes.length ? 'Sem mudança nas marcas.' : 'Escolha pelo menos uma marca.')
              : acao === 'desbloqueio' ? 'Sem nenhuma marca marcada, o e-mail fica desbloqueado e a próxima conversão segue o fluxo normal.'
              : [adicionadas.length ? `Passa a bloquear: ${textoMarcas(adicionadas, [], rotulo)}` : '', removidas.length ? `Deixa de bloquear: ${textoMarcas(removidas, [], rotulo)}` : ''].filter(Boolean).join(' · ')}
          </div>
        </div>

        <div>
          <label htmlFor="bloqueio-motivo" style={rotuloCampo}>
            {acao === 'desbloqueio' ? 'Por que desbloquear?' : acao === 'alteracao' ? 'Por que mudar as marcas?' : 'Por que bloquear?'}{' '}
            <span style={{ color: 'var(--status-risco)' }}>* obrigatório</span>
          </label>
          <textarea id="bloqueio-motivo" rows={4} required aria-required="true" style={{ ...inputStyle, width: '100%', padding: '8px 10px', resize: 'vertical', borderColor: motivo && !motivoOk ? 'var(--status-risco)' : undefined }}
            placeholder={acao === 'desbloqueio' ? 'Ex.: lead pediu retorno, agora tem capital' : 'Ex.: 3 negócios perdidos por fora do perfil, segue se cadastrando'}
            value={motivo} onChange={e => setMotivo(e.target.value)} />
          <div style={{ fontSize: 12, color: motivoOk ? 'var(--ws-text-secondary)' : 'var(--status-risco)', marginTop: 4 }}>
            {motivoOk ? 'Fica no histórico, com o seu e-mail de login e a data.' : 'Escreva o motivo (pelo menos 3 letras) para liberar o botão.'}
          </div>
        </div>

        {erro && <div style={bannerStyle('erro')}>{erro}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={secondaryButtonStyle} onClick={onFechar}>Cancelar</button>
          <button type="button" style={pode ? primaryButtonStyle : disabledButtonStyle} disabled={!pode} onClick={salvar}>
            {salvando ? 'Salvando…' : acao ? BOTAO[acao] : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
