import { X } from 'lucide-react'
import { useRosterVendas } from '@/hooks/useRosterVendas'
import { dividirIgualmente, metasPorPessoa, ROTULO_ETAPA, type EtapaMetaConfig, type FunilCalculado, type MarcaConfig, type MetaPessoa } from '@/lib/configMetas'
import type { PessoaComFuncao } from '@/lib/metasEngine'
import { CampoNumero } from './CampoNumero'
import { fmtBRL, fmtDec, ghostButtonStyle, inputStyle, pillStyle } from './metasUi'

const FUNCOES = [
  { funcao: 'SDR' as const, titulo: 'SDRs', leva: 'Ligações, SQL, Diagnóstico e SAL' },
  { funcao: 'Closer' as const, titulo: 'Closers', leva: 'COF, Vendas e faturamento' },
]

const ORDEM_SDR: EtapaMetaConfig[] = ['Reunião Agendada SQL', 'Reunião Realizada', 'SAL', 'Ligações']

function resumoPessoa(meta: MetaPessoa | undefined): string {
  if (!meta) return ''
  if (meta.funcao === 'SDR') {
    return ORDEM_SDR.filter(e => meta.valores[e] != null).map(e => `${ROTULO_ETAPA[e]} ${fmtDec(meta.valores[e]!)}`).join(' · ') || 'sem metas de SDR'
  }
  const partes: string[] = []
  if (meta.valores['Oportunidade COF'] != null) partes.push(`COF ${fmtDec(meta.valores['Oportunidade COF'])}`)
  if (meta.valores.Fechamento != null) partes.push(`Vendas ${fmtDec(meta.valores.Fechamento)}`)
  if (meta.faturamento != null) partes.push(fmtBRL(meta.faturamento))
  return partes.join(' · ')
}

export function TimeMarca({ marca, funil, onMudarPessoas }: {
  marca: MarcaConfig
  funil: FunilCalculado
  onMudarPessoas: (pessoas: PessoaComFuncao[]) => void
}) {
  const { data: roster } = useRosterVendas()
  const previa = metasPorPessoa(marca, funil)

  return (
    <div className="rs-grid rs-cols-2" style={{ gap: 16 }}>
      {FUNCOES.map(({ funcao, titulo, leva }) => {
        const dessa = marca.pessoas.filter(p => p.funcao === funcao)
        const soma = dessa.reduce((s, p) => s + p.peso, 0)
        const somaOk = Math.abs(soma - 100) <= 0.01
        const disponiveis = (roster ?? []).filter(r => (r.cargo === funcao || r.cargo === 'SDR/Closer') && !dessa.some(d => d.nome === r.nome))
        const adicionar = (nome: string) => onMudarPessoas(dividirIgualmente([...marca.pessoas, { nome, funcao, peso: 0 }], funcao))
        const remover = (nome: string) => onMudarPessoas(dividirIgualmente(marca.pessoas.filter(p => !(p.nome === nome && p.funcao === funcao)), funcao))
        const mudarPeso = (nome: string, peso: number | null) =>
          onMudarPessoas(marca.pessoas.map(p => (p.nome === nome && p.funcao === funcao ? { ...p, peso: peso ?? 0 } : p)))

        return (
          <div key={funcao} style={{ border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', padding: 16, background: 'var(--ws-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</div>
                <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>levam {leva}</div>
              </div>
              {dessa.length > 0 && (
                <span style={pillStyle(somaOk ? 'sucesso' : 'erro')}>soma {fmtDec(soma)}%</span>
              )}
            </div>

            {dessa.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', padding: '6px 0 10px' }}>
                Ninguém ainda — adicione abaixo.
              </div>
            )}

            {dessa.map(p => (
              <div key={p.nome} style={{ padding: '8px 0', borderTop: '1px solid var(--ws-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, minWidth: 0 }}>{p.nome}</span>
                  <CampoNumero valor={p.peso} onMudar={v => mudarPeso(p.nome, v)} casas={2} sufixo="%" largura={70} rotulo={`Peso de ${p.nome}`} />
                  <button type="button" onClick={() => remover(p.nome)} aria-label={`Remover ${p.nome}`} style={{ ...ghostButtonStyle, padding: 4 }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
                  {resumoPessoa(previa.find(x => x.nome === p.nome && x.funcao === funcao))}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <select
                value=""
                onChange={e => { if (e.target.value) adicionar(e.target.value) }}
                style={{ ...inputStyle, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}
                aria-label={`Adicionar ${funcao}`}
              >
                <option value="">+ adicionar {funcao}…</option>
                {disponiveis.map(r => <option key={r.nome} value={r.nome}>{r.nome}</option>)}
              </select>
              {dessa.length > 1 && (
                <button type="button" onClick={() => onMudarPessoas(dividirIgualmente(marca.pessoas, funcao))} style={{ ...ghostButtonStyle, fontSize: 12 }}>
                  Dividir igualmente
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
