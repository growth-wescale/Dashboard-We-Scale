import { useMemo, useState, type CSSProperties } from 'react'
import { X } from 'lucide-react'
import { bannerStyle, cardStyle, disabledButtonStyle, inputStyle, primaryButtonStyle, secondaryButtonStyle } from '@/components/metas/metasUi'
import type { ModoRegra, PessoaPeso, RegraRow } from '@/lib/distribuicao/regras'
import type { CampoVisto, PessoaRd } from '@/hooks/useDistribuicao'
import type { RegraInput } from '@/hooks/useGravarDistribuicao'

interface Props {
  regra: RegraRow | null          // null = marca nova
  camposVistos: CampoVisto[]
  pessoas: PessoaRd[]
  fonteTime: string | null
  onSalvar: (regra: RegraInput, motivo: string) => Promise<string | null>  // devolve mensagem de erro ou null
  onFechar: () => void
}

const rotulo: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', marginBottom: 4, display: 'block' }
const campo: CSSProperties = { ...inputStyle, width: '100%', boxSizing: 'border-box' }

function Campo({ label, children, dica }: { label: string; children: React.ReactNode; dica?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={rotulo}>{label}</span>
      {children}
      {dica && <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 3 }}>{dica}</div>}
    </label>
  )
}

export function EditorRegra({ regra, camposVistos, pessoas, fonteTime, onSalvar, onFechar }: Props) {
  const [f, setF] = useState<RegraInput>({
    marca: regra?.marca ?? '', marca_rd: regra?.marca_rd ?? '', modo: regra?.modo ?? 'sombra',
    evento_identificador: regra?.evento_identificador ?? '', id_funil: regra?.id_funil ?? '', id_etapa: regra?.id_etapa ?? '',
    campaign_id: regra?.campaign_id ?? null, barreira_campo: regra?.barreira_campo ?? null,
    barreira_valores_barrados: regra?.barreira_valores_barrados ?? [], responsavel_padrao_user_id: regra?.responsavel_padrao_user_id ?? '',
    nome_formato: regra?.nome_formato ?? null, campos_extra: regra?.campos_extra ?? {}, time_proprio: regra?.time_proprio ?? null,
  })
  const [motivo, setMotivo] = useState('')
  const [novoValor, setNovoValor] = useState('')
  const [extraChave, setExtraChave] = useState('')
  const [extraId, setExtraId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const chavesDaMarca = useMemo(() => camposVistos.filter(c => c.marca === f.marca), [camposVistos, f.marca])
  const valoresSugeridos = useMemo(() => chavesDaMarca.find(c => c.chave === f.barreira_campo)?.valores ?? [], [chavesDaMarca, f.barreira_campo])
  const responsaveis = pessoas.filter(p => p.user_id && p.ativo)
  const sdrs = pessoas.filter(p => p.user_id && p.ativo && (p.cargo === 'SDR' || p.cargo === 'SDR/Closer'))
  const timeProprioVale = fonteTime !== 'versao_ativa' && fonteTime !== 'versao_anterior'
  const somaTime = (f.time_proprio ?? []).reduce((s, p) => s + (Number(p.peso) || 0), 0)
  const precisaMotivo = regra != null
  const set = <K extends keyof RegraInput>(k: K, v: RegraInput[K]) => setF(prev => ({ ...prev, [k]: v }))

  function addValor(v: string) {
    const t = v.trim()
    if (!t || f.barreira_valores_barrados.includes(t)) return
    set('barreira_valores_barrados', [...f.barreira_valores_barrados, t])
    setNovoValor('')
  }
  function setTime(lista: PessoaPeso[] | null) { set('time_proprio', lista && lista.length ? lista : null) }

  async function salvar() {
    setErro(null)
    if (!f.marca || !f.marca_rd || !f.evento_identificador || !f.id_funil || !f.id_etapa || !f.responsavel_padrao_user_id) {
      setErro('Preencha marca, marca no RD, evento, funil, etapa e responsável padrão.'); return
    }
    if (precisaMotivo && !motivo.trim()) { setErro('Informe o motivo da mudança.'); return }
    if (f.time_proprio && Math.abs(somaTime - 100) > 0.01) { setErro(`O time próprio precisa somar 100% (está em ${somaTime}%).`); return }
    setSalvando(true)
    const e = await onSalvar({ ...f, barreira_campo: f.barreira_campo || null }, motivo.trim())
    setSalvando(false)
    if (e) setErro(e); else onFechar()
  }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, zIndex: 60, overflowY: 'auto' }}>
      <div style={{ ...cardStyle, width: 'min(720px, 100%)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20 }}>{regra ? `Regra · ${regra.marca} (v${regra.versao} → v${regra.versao + 1})` : 'Nova marca'}</h2>
          <button type="button" aria-label="Fechar" onClick={onFechar} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
          Salvar publica uma versão nova e encerra a vigente; versões antigas ficam no histórico. Mudar o modo para <strong>Ativo</strong> só depois de remover o passo "Criar Negociação no CRM" da automação do RD Marketing.
        </div>

        <div className="rs-grid rs-cols-2" style={{ gap: 12 }}>
          <Campo label="Marca (nome das metas)"><input style={campo} value={f.marca} disabled={!!regra} onChange={e => set('marca', e.target.value)} /></Campo>
          <Campo label="Marca no RD CRM" dica="valor do campo Marca do deal"><input style={campo} value={f.marca_rd} onChange={e => set('marca_rd', e.target.value)} /></Campo>
          <Campo label="Modo">
            <select style={campo} value={f.modo} onChange={e => set('modo', e.target.value as ModoRegra)}>
              <option value="desligado">Desligado (ignora o evento)</option>
              <option value="sombra">Sombra (só registra o que faria)</option>
              <option value="ativo">Ativo (cria o deal no RD)</option>
            </select>
          </Campo>
          <Campo label="Evento de conversão" dica="identificador do webhook, ex. eletrovias_multistep"><input style={campo} value={f.evento_identificador} onChange={e => set('evento_identificador', e.target.value)} /></Campo>
          <Campo label="ID do funil (RD CRM)"><input style={campo} value={f.id_funil} onChange={e => set('id_funil', e.target.value)} /></Campo>
          <Campo label="ID da etapa de entrada"><input style={campo} value={f.id_etapa} onChange={e => set('id_etapa', e.target.value)} /></Campo>
          <Campo label="ID da campanha (opcional)"><input style={campo} value={f.campaign_id ?? ''} onChange={e => set('campaign_id', e.target.value || null)} /></Campo>
          <Campo label="Responsável padrão" dica="recebe o deal quando nenhum SDR está elegível">
            <select style={campo} value={f.responsavel_padrao_user_id} onChange={e => set('responsavel_padrao_user_id', e.target.value)}>
              <option value="">— escolher —</option>
              {responsaveis.map(p => <option key={p.user_id!} value={p.user_id!}>{p.nome} ({p.cargo})</option>)}
            </select>
          </Campo>
          <Campo label="Nome do deal (opcional)" dica="use {primeiro_nome}; vazio = nome do lead"><input style={campo} value={f.nome_formato ?? ''} onChange={e => set('nome_formato', e.target.value || null)} /></Campo>
        </div>

        <fieldset style={{ border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
          <legend style={rotulo}>Barreira de MQL</legend>
          <div className="rs-grid rs-cols-2" style={{ gap: 12 }}>
            <Campo label="Campo do lead" dica="chaves cf_* vistas nos payloads desta marca, ou digite">
              <input style={campo} list="campos-vistos" value={f.barreira_campo ?? ''} onChange={e => set('barreira_campo', e.target.value || null)} placeholder="sem barreira" />
              <datalist id="campos-vistos">{chavesDaMarca.map(c => <option key={c.chave} value={c.chave} />)}</datalist>
            </Campo>
            <Campo label="Valores que barram" dica="o lead entra quando o campo é diferente de todos estes; campo vazio passa">
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={campo} list="valores-sugeridos" value={novoValor} onChange={e => setNovoValor(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addValor(novoValor) } }} placeholder="digite e Enter" />
                <datalist id="valores-sugeridos">{valoresSugeridos.map(v => <option key={v} value={v} />)}</datalist>
                <button type="button" style={{ ...secondaryButtonStyle, padding: '6px 10px' }} onClick={() => addValor(novoValor)}>+</button>
              </div>
            </Campo>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {f.barreira_valores_barrados.map(v => (
              <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: 'var(--ws-bg)', fontSize: 12 }}>
                {v}<button type="button" aria-label={`remover ${v}`} onClick={() => set('barreira_valores_barrados', f.barreira_valores_barrados.filter(x => x !== v))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}><X size={12} /></button>
              </span>
            ))}
            {f.barreira_valores_barrados.length === 0 && <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>sem barreira</span>}
          </div>
        </fieldset>

        <fieldset style={{ border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
          <legend style={rotulo}>Campos extras enviados ao CRM</legend>
          <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginBottom: 6 }}>chave do payload → ID do campo personalizado do deal. Marca, Fonte Macro, Cidade, Estado e UTMs já vão sempre.</div>
          {Object.entries(f.campos_extra).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
              <code>{k}</code> → <code>{v}</code>
              <button type="button" aria-label={`remover ${k}`} onClick={() => { const c = { ...f.campos_extra }; delete c[k]; set('campos_extra', c) }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}><X size={12} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input style={campo} list="campos-vistos" placeholder="cf_… do payload" value={extraChave} onChange={e => setExtraChave(e.target.value)} />
            <input style={campo} placeholder="custom_field_id no CRM" value={extraId} onChange={e => setExtraId(e.target.value)} />
            <button type="button" style={{ ...secondaryButtonStyle, padding: '6px 10px' }} onClick={() => { if (extraChave.trim() && extraId.trim()) { set('campos_extra', { ...f.campos_extra, [extraChave.trim()]: extraId.trim() }); setExtraChave(''); setExtraId('') } }}>+</button>
          </div>
        </fieldset>

        <fieldset style={{ border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', padding: 12, opacity: timeProprioVale ? 1 : 0.7 }}>
          <legend style={rotulo}>Time próprio (só vale para marca sem meta publicada)</legend>
          {!timeProprioVale && <div style={{ ...bannerStyle('atencao'), marginBottom: 8 }}>Esta marca tem meta publicada: a distribuição segue os pesos da Configuração das Metas. O time próprio só entra se a marca sair da meta.</div>}
          {(f.time_proprio ?? []).map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <select style={{ ...campo, maxWidth: 260 }} value={p.nome} onChange={e => { const t = [...(f.time_proprio ?? [])]; t[i] = { ...t[i], nome: e.target.value }; setTime(t) }}>
                {sdrs.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
              </select>
              <input type="number" min={0} max={100} step={1} style={{ ...campo, maxWidth: 90 }} value={p.peso} onChange={e => { const t = [...(f.time_proprio ?? [])]; t[i] = { ...t[i], peso: Number(e.target.value) }; setTime(t) }} />%
              <button type="button" aria-label="remover" onClick={() => setTime((f.time_proprio ?? []).filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}><X size={12} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" style={{ ...secondaryButtonStyle, padding: '6px 10px' }} onClick={() => setTime([...(f.time_proprio ?? []), { nome: sdrs[0]?.nome ?? '', peso: 0 }])} disabled={sdrs.length === 0}>+ SDR</button>
            {f.time_proprio && <span style={{ fontSize: 12, color: Math.abs(somaTime - 100) > 0.01 ? 'var(--status-risco)' : 'var(--ws-text-secondary)' }}>soma {somaTime}%</span>}
          </div>
        </fieldset>

        {precisaMotivo && (
          <Campo label="Motivo da mudança (obrigatório)"><input style={campo} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="ex.: virada da Eletrovias para ativo" /></Campo>
        )}
        {erro && <div style={bannerStyle('erro')}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={secondaryButtonStyle} onClick={onFechar}>Cancelar</button>
          <button type="button" style={salvando ? disabledButtonStyle : primaryButtonStyle} disabled={salvando} onClick={salvar}>{salvando ? 'Publicando…' : 'Publicar versão'}</button>
        </div>
      </div>
    </div>
  )
}
