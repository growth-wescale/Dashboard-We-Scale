import { PARTNER_FECHAMENTOS } from '@/constants/partnerFechamento'
import './partnerComparativo.css'

// Valores do comparativo de 2026 fornecido pela operação, nas precisões do artefato.
type Linha = readonly [indicador: string, anterior: string, recente: string, variacao?: string]

function Tabela({ titulo, linhas, custos = false }: { titulo: string; linhas: Linha[]; custos?: boolean }) {
  return (
    <table className="partner-comparativo-tabela">
      <caption>{titulo}</caption>
      <thead><tr>
        <th scope="col">Indicador</th>
        {PARTNER_FECHAMENTOS.map(periodo => <th key={periodo.start} scope="col">{periodo.label}</th>)}
        {custos && <th scope="col">Variação</th>}
      </tr></thead>
      <tbody>{linhas.map(([indicador, anterior, recente, variacao]) => (
        <tr key={indicador}>
          <th scope="row">{indicador}</th><td>{anterior}</td><td>{recente}</td>
          {custos && <td>{variacao}</td>}
        </tr>
      ))}</tbody>
    </table>
  )
}

export function PartnerComparativo() {
  return <>
    <section className="partner-comparativo" aria-label="Custos e ritmo de campanha">
      <h2>Custos e ritmo de campanha</h2>
      <p className="partner-destaque">O custo por MQL caiu <strong>43,2%</strong> no segundo período.</p>
      <Tabela titulo="Custo por etapa" custos linhas={[
        ['Por lead', 'R$ 334,10', 'R$ 215,65', '−35,5%'],
        ['Por venda única', 'R$ 2.383,27', 'R$ 3.522,31', '+47,8%'],
        ['Por pessoa no geral', 'R$ 2.102,88', 'R$ 1.921,26', '−8,6%'],
      ]} />
      <Tabela titulo="Ritmo por 30 dias corridos" linhas={[
        ['Investimento', 'R$ 10.312', 'R$ 9.606'],
        ['Leads', '30,9', '44,5'], ['MQLs', '14,1', '23,2'], ['Vendas únicas', '4,3', '2,7'],
      ]} />
      <Tabela titulo="Atividade da conta" linhas={[
        ['Dias com gasto', '98 de 104', '65 de 66'],
        ['Investimento por dia ativo', 'R$ 364,79', 'R$ 325,14'],
      ]} />
    </section>
    <section className="partner-comparativo" aria-label="Conversão e retorno">
      <h2>Conversão e retorno</h2>
      <p className="partner-destaque">Uma parcela maior dos leads virou MQL. Uma parcela menor dos MQLs fechou venda.</p>
      <Tabela titulo="Taxas do funil" linhas={[
        ['Lead → MQL', '45,8%', '52,0%'], ['MQL → venda', '30,6%', '11,8%'], ['Lead → venda', '14,0%', '6,1%'],
      ]} />
      <Tabela titulo="Retorno e pessoas" linhas={[
        ['Pessoas no geral', '17', '11'],
        ['Ticket por venda única', 'R$ 1.836,67', 'R$ 2.286,28'],
        ['ROAS', '0,77', '0,65'],
        ['Faturamento por pessoa', 'R$ 1.620,59', 'R$ 1.247,06'],
      ]} />
      <p className="partner-nota">Investimento da conta We Scale Holding, excluindo IDA e Lisô Evento. O CRM conta os negócios fechados como vendas únicas e, separadamente, as pessoas que entraram no geral.</p>
      <p className="partner-nota">O primeiro período inclui Google, testes e carrosséis. O segundo fechamento ainda não incluía o gasto do Google. Os MQLs de setembro e outubro ainda podiam gerar novas vendas.</p>
    </section>
  </>
}
