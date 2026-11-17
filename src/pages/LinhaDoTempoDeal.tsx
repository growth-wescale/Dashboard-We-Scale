import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { SCard } from '@/components/ui/v2'
import { useAcesso } from '@/contexts/AcessoContext'
import { useDealTimeline } from '@/hooks/useDealTimeline'
import { rdDealUrl } from '@/lib/rd'
import { findBrandByMarca } from '@/constants/brands'
import { DealHeader } from '@/components/timeline/DealHeader'
import { ResumoCiclos } from '@/components/timeline/ResumoCiclos'
import { HistoricoDeal } from '@/components/timeline/HistoricoDeal'

const pad = { padding: 'var(--page-pad-top) var(--page-pad-x) 60px', maxWidth: 1400, margin: '0 auto' } as const

export function LinhaDoTempoDeal() {
  const { idDeal } = useParams<{ idDeal: string }>()
  const { marcas: marcasPermitidas } = useAcesso()
  const { timeline, cabecalho, loading, naoEncontrado, erros } = useDealTimeline(idDeal)

  // Pessoa limitada a marcas só vê deal das marcas dela.
  const foraDaMarca = !!cabecalho && !!marcasPermitidas && !marcasPermitidas.includes(findBrandByMarca(cabecalho.row.marca)?.key ?? '')

  const voltar = (
    <Link to="/linha-do-tempo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ws-text-secondary)', marginBottom: 16 }}>
      <ArrowLeft size={14} /> Linha do Tempo
    </Link>
  )

  if (loading) {
    return <div style={pad}>{voltar}<div style={{ color: 'var(--ws-text-secondary)' }}>Carregando a história do deal…</div></div>
  }

  if (naoEncontrado || foraDaMarca || !timeline || !cabecalho) {
    return (
      <div style={pad}>
        {voltar}
        <QueryErrorBanner errors={[erros.deal]} scope="deal" />
        <SCard>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ws-text-primary)' }}>Deal não encontrado no dashboard</div>
          <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 6 }}>
            Deal sem marca no RD, de teste, excluído ou fora das marcas do seu acesso não aparece aqui.
          </div>
          {idDeal && (
            <a href={rdDealUrl(idDeal)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 13, fontWeight: 600, color: 'var(--ws-vinho-b)' }}>
              Abrir no RD <ExternalLink size={12} />
            </a>
          )}
        </SCard>
      </div>
    )
  }

  return (
    <div style={pad}>
      {voltar}
      <QueryErrorBanner
        errors={[
          erros.eventos && `eventos: ${erros.eventos}`,
          erros.tarefas && `tarefas indisponíveis: ${erros.tarefas}`,
          erros.reunioes && `reuniões indisponíveis: ${erros.reunioes}`,
          erros.cadencias && `cadência indisponível: ${erros.cadencias}`,
        ]}
        scope="parte da linha do tempo"
      />
      <DealHeader cabecalho={cabecalho} timeline={timeline} />
      <SCard style={{ marginTop: 20 }} pad={22}>
        <h2 style={{ margin: '0 0 14px', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, color: 'var(--ws-text-primary)' }}>
          {cabecalho.ciclos.length > 1 ? `A história em ${cabecalho.ciclos.length} ciclos` : 'A história do negócio'}
        </h2>
        <ResumoCiclos timeline={timeline} />
      </SCard>
      <SCard style={{ marginTop: 16 }} pad={22}>
        <h2 style={{ margin: '0 0 14px', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, color: 'var(--ws-text-primary)' }}>
          Tudo o que aconteceu
        </h2>
        <HistoricoDeal timeline={timeline} />
      </SCard>
    </div>
  )
}
