import { fmtBR } from '@/lib/dateUtils'
import { SERIE_LIVES_LEGACY as serie } from '@/constants/comunidadeLegacy'

export function InscricoesLivesLegacy({ inicio, fim }: { inicio: string; fim: string }) {
  const corte = fim < serie.atualizadoAte ? fim : serie.atualizadoAte
  let acumulado = 0
  let inscritos = 0
  const historico = serie.inscricoes.filter(r => r.dia <= corte).sort((a, b) => a.dia.localeCompare(b.dia)).map(r => {
    acumulado += r.pessoas
    if (r.dia >= inicio) inscritos += r.pessoas
    return { dia: r.dia, acumulado }
  })
  const periodoCoberto = inicio <= corte

  return <section className="sop-lives-legacy" aria-label="Inscrições nas lives de Odonto Legacy">
    <h3>Inscrições nas lives · {serie.nome}</h3>
    <dl>
      <div><dt>Novos inscritos no período</dt><dd>{periodoCoberto ? inscritos : '—'}</dd></div>
      <div><dt>Inscritos únicos na série</dt><dd>{acumulado}</dd><small>até {fmtBR(corte)}</small></div>
    </dl>
    {historico.length > 0 && <table aria-label="Histórico de inscrições externas por data de cadastro">
      <thead><tr><th scope="col">Histórico de inscrições</th><th scope="col">Inscritos acumulados</th></tr></thead>
      <tbody>{historico.map(r => <tr key={r.dia}><td>{fmtBR(r.dia)}</td><td>{r.acumulado}</td></tr>)}</tbody>
    </table>}
    {fim > serie.atualizadoAte && <p>Último relatório disponível em {fmtBR(serie.atualizadoAte)}.</p>}
    <p>Cada pessoa com inscrição aprovada no Zoom conta uma vez na série. Equipe e cancelamentos ficam fora. Os relatórios não informam presença por encontro.</p>
  </section>
}
