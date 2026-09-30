import { ArrowLeft, ArrowRight } from 'lucide-react'
import { marcaLabel } from '@/constants/brands'
import type { DistribuicaoSemanalItem } from '@/hooks/useMetaMes'
import { gerarSemanas, type DiaSemana, type EtapaMeta } from '@/lib/metasEngine'
import {
  ETAPAS_SEMANAIS, ROTULO_ETAPA, arredondarMeta, diasDaSemana, distribuirProporcional, metasPorPessoa,
  type EtapaMetaConfig, type RascunhoConfig,
} from '@/lib/configMetas'
import { CampoNumero } from './CampoNumero'
import { cardStyle, fmtInt, ghostButtonStyle, infoBoxStyle, inputStyle, primaryButtonStyle, secondaryButtonStyle, smallButtonStyle } from './metasUi'

const DIAS: DiaSemana[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']
const DIA_LABEL: Record<DiaSemana, string> = {
  segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo',
}

interface LinhaSemanal {
  marca: string
  nome: string
  etapa: EtapaMeta
  metaMes: number
}

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
  const valores = new Map(rascunho.distribuicaoSemanal.map(d => [`${d.marca}|${d.nomePessoa}|${d.etapa}|${d.semanaNumero}`, d.valor]))

  const porMarca = rascunho.marcas.map(m => {
    const linhas: LinhaSemanal[] = []
    for (const p of metasPorPessoa(m)) {
      for (const etapa of ETAPAS_SEMANAIS[p.funcao]) {
        const v = p.valores[etapa as EtapaMetaConfig]
        if (v != null) linhas.push({ marca: m.marca, nome: p.nome, etapa, metaMes: arredondarMeta(v) })
      }
    }
    return { marca: m.marca, linhas }
  }).filter(g => g.linhas.length > 0)

  function comLinha(linha: LinhaSemanal, novos: (number | null)[]): DistribuicaoSemanalItem[] {
    const resto = rascunho.distribuicaoSemanal.filter(d => !(d.marca === linha.marca && d.nomePessoa === linha.nome && d.etapa === linha.etapa))
    const itens = novos.flatMap((v, i) => (v != null && v > 0
      ? [{ marca: linha.marca, nomePessoa: linha.nome, etapa: linha.etapa, semanaNumero: semanas[i].numero, valor: v }]
      : []))
    return [...resto, ...itens]
  }

  function mudarCelula(linha: LinhaSemanal, semanaNumero: number, valor: number | null) {
    const atuais = semanas.map(s => (s.numero === semanaNumero ? valor : valores.get(`${linha.marca}|${linha.nome}|${linha.etapa}|${s.numero}`) ?? null))
    onMudar({ ...rascunho, distribuicaoSemanal: comLinha(linha, atuais) })
  }

  function preencherTudo() {
    if (rascunho.distribuicaoSemanal.length > 0 && !window.confirm('Substituir tudo o que já foi distribuído pela divisão proporcional aos dias?')) return
    const itens: DistribuicaoSemanalItem[] = []
    for (const g of porMarca) {
      for (const l of g.linhas) {
        distribuirProporcional(l.metaMes, semanas).forEach((v, i) => {
          if (v > 0) itens.push({ marca: l.marca, nomePessoa: l.nome, etapa: l.etapa, semanaNumero: semanas[i].numero, valor: v })
        })
      }
    }
    onMudar({ ...rascunho, distribuicaoSemanal: itens })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>A semana começa na</span>
            <select
              value={rascunho.diaViradaSemana}
              onChange={e => {
                const dia = e.target.value as DiaSemana
                const novas = gerarSemanas(rascunho.mesReferencia, dia)
                onMudar({ ...rascunho, diaViradaSemana: dia, semanas: novas, distribuicaoSemanal: rascunho.distribuicaoSemanal.filter(d => d.semanaNumero <= novas.length) })
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
        <span style={{ flex: 1, minWidth: 240 }}>
          Opcional: distribua a meta do mês de cada pessoa pelas semanas. Não trava a publicação — pode deixar em branco.
        </span>
        {porMarca.length > 0 && <button type="button" onClick={preencherTudo} style={smallButtonStyle}>Preencher tudo proporcional aos dias</button>}
      </div>

      {porMarca.length === 0 && (
        <div style={{ ...cardStyle, color: 'var(--ws-text-secondary)', fontSize: 13 }}>
          Nenhuma marca tem meta calculada ainda — configure as marcas primeiro.
        </div>
      )}

      {porMarca.map(g => (
        <div key={g.marca} style={cardStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>{marcaLabel(g.marca)}</h3>
          <div className="rs-scroll-x">
            <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 180 + semanas.length * 92 + 220 }}>
              <thead>
                <tr style={{ color: 'var(--ws-text-secondary)', fontSize: 11, textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>Pessoa · etapa</th>
                  {semanas.map(s => <th key={s.numero} style={{ padding: '6px 4px', fontWeight: 600, whiteSpace: 'nowrap' }}>S{s.numero}</th>)}
                  <th style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>Distribuído</th>
                  <th style={{ padding: '6px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {g.linhas.map(l => {
                  const doMes = semanas.map(s => valores.get(`${l.marca}|${l.nome}|${l.etapa}|${s.numero}`) ?? null)
                  const alocado = doMes.reduce<number>((a, v) => a + (v ?? 0), 0)
                  const cor = alocado === l.metaMes ? 'var(--status-positivo)' : alocado > l.metaMes ? 'var(--status-risco)' : 'var(--ws-text-secondary)'
                  return (
                    <tr key={`${l.nome}|${l.etapa}`} style={{ borderTop: '1px solid var(--ws-border)' }}>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{l.nome} · {ROTULO_ETAPA[l.etapa as EtapaMetaConfig]}</td>
                      {semanas.map((s, i) => (
                        <td key={s.numero} style={{ padding: '4px' }}>
                          <CampoNumero valor={doMes[i]} onMudar={v => mudarCelula(l, s.numero, v)} largura={44} rotulo={`${l.nome} ${ROTULO_ETAPA[l.etapa as EtapaMetaConfig]} S${s.numero}`} />
                        </td>
                      ))}
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: cor, fontWeight: 600 }}>
                        {fmtInt(alocado)} de {fmtInt(l.metaMes)}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <button
                          type="button"
                          onClick={() => onMudar({ ...rascunho, distribuicaoSemanal: comLinha(l, distribuirProporcional(l.metaMes, semanas)) })}
                          style={{ ...ghostButtonStyle, fontSize: 12, whiteSpace: 'nowrap' }}
                        >
                          proporcional
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onVoltar} style={{ ...secondaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}><ArrowLeft size={14} /> Marcas</button>
        <button type="button" onClick={onAvancar} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>Revisar e publicar <ArrowRight size={14} /></button>
      </div>
    </div>
  )
}
