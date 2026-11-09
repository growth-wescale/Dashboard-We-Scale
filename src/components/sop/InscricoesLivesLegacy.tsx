import { fmtBR } from '@/lib/dateUtils'
import { SERIE_LIVES_LEGACY as serie } from '@/constants/comunidadeLegacy'

export function InscricoesLivesLegacy({ inicio, fim }: { inicio: string; fim: string }) {
  const corte = fim < serie.atualizadoAte ? fim : serie.atualizadoAte
  const historico = serie.inscricoes.filter(r => r.dia <= corte)
  const noPeriodo = historico.filter(r => r.dia >= inicio)
  const inscritos = noPeriodo.reduce((n, r) => n + r.pessoas, 0)
  const acumulado = historico.reduce((n, r) => n + r.pessoas, 0)
  const periodoCoberto = inicio <= corte

  return <section className="sop-lives-legacy" aria-label="Inscrições nas lives de Odonto Legacy">
    <h3>Lives no Zoom · {serie.nome}</h3>
    <dl>
      <div><dt>Novos inscritos no período</dt><dd>{periodoCoberto ? inscritos : '—'}</dd></div>
      <div><dt>Inscritos únicos na série</dt><dd>{acumulado}</dd><small>até {fmtBR(corte)}</small></div>
    </dl>
    {historico.length > 0 && <table aria-label="Histórico de inscrições externas por data de cadastro">
      <thead><tr><th scope="col">Histórico de inscrições</th><th scope="col">Novos inscritos</th></tr></thead>
      <tbody>{historico.map(r => <tr key={r.dia}><td>{fmtBR(r.dia)}</td><td>{r.pessoas}</td></tr>)}</tbody>
    </table>}
    {fim > serie.atualizadoAte && <p>Último relatório disponível em {fmtBR(serie.atualizadoAte)}.</p>}
    <p>Contagem de inscrições externas aprovadas. O Zoom forneceu uma lista única para a série. Presença e retorno por encontro não estão disponíveis.</p>
  </section>
}
