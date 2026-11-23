import { fmtBR } from '@/lib/dateUtils'
import { PRESENCAS_LIVES_LEGACY as fonte, presencasLivesLegacy } from '@/lib/presencasLivesLegacy'

export function PresencasLivesLegacy({ inicio, fim }: { inicio: string; fim: string }) {
  const dados = presencasLivesLegacy(inicio, fim)
  const temLives = dados.historico.length > 0
  return <section className="sop-lives-legacy" aria-label="Presença nas lives de Odonto Legacy">
    <h3>Presença nas lives · {fonte.nome}</h3>
    <dl>
      <div><dt>Participantes externos únicos</dt><dd>{temLives ? dados.unicos : '—'}</dd><small>no período selecionado</small></div>
      <div><dt>Voltaram a outras lives</dt><dd>{temLives ? dados.recorrentes : '—'}</dd><small>em 2 ou mais encontros do período</small></div>
    </dl>
    {temLives ? <table aria-label="Presença externa por live e acumulado do período">
      <thead><tr><th scope="col">Live</th><th scope="col">Presentes</th><th scope="col">Únicos acumulados</th></tr></thead>
      <tbody>{dados.historico.map(r => <tr key={r.dia}><td>{fmtBR(r.dia)}</td><td>{r.presentes}</td><td>{r.acumulados}</td></tr>)}</tbody>
    </table> : <p>Sem encontros com presença informada neste período.</p>}
    <p>Presença registrada no Zoom, com relatório até {fmtBR(fonte.ate)}. Equipe e reconexões ficam fora da contagem. Cada e-mail conta uma vez por live e no acumulado; e-mails diferentes não são unificados por nome.</p>
  </section>
}
