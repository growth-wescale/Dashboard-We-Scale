import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { SCard } from '@/components/ui/v2'
import { useAcesso } from '@/contexts/AcessoContext'
import { useDealTimeline } from '@/hooks/useDealTimeline'
import { useZoomPan } from '@/hooks/useZoomPan'
import { layoutPista } from '@/lib/timeline/layout'
import { rdDealUrl } from '@/lib/rd'
import { findBrandByMarca } from '@/constants/brands'
import { DealHeader } from '@/components/timeline/DealHeader'
import { PistaCanvas } from '@/components/timeline/PistaCanvas'
import { ZoomControls } from '@/components/timeline/ZoomControls'
import { TimelineLegend } from '@/components/timeline/TimelineLegend'
import { MomentoPopover } from '@/components/timeline/MomentoPopover'
import type { AlvoPopover } from '@/components/timeline/MomentoPopover'

/**
 * Largura medida do container da pista — o layout precisa dela em px.
 * Ref de CALLBACK, não `useRef`: o container só entra na árvore depois que o
 * deal carrega (antes disso a tela é o "Carregando…"), e um efeito com `[]`
 * rodaria uma vez só, com a ref ainda nula — o ResizeObserver nunca se
 * ligaria e a Pista não renderizava (largura presa em 0).
 */
function useLargura<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [largura, setLargura] = useState(0)
  useEffect(() => {
    if (!el) return
    // Mede na hora: a 1ª entrega do ResizeObserver é assíncrona e o navegador
    // a adia enquanto a aba está em segundo plano — sem esta linha a Pista
    // fica em branco até a aba voltar pra frente.
    setLargura(Math.floor(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(entries => setLargura(Math.floor(entries[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return { ref: setEl, largura }
}

const pad = { padding: 'var(--page-pad-top) var(--page-pad-x) 60px', maxWidth: 1400, margin: '0 auto' } as const

export function LinhaDoTempoDeal() {
  const { idDeal } = useParams<{ idDeal: string }>()
  const { marcas: marcasPermitidas } = useAcesso()
  const { timeline, cabecalho, loading, naoEncontrado, erros } = useDealTimeline(idDeal)
  const { ref, largura } = useLargura<HTMLDivElement>()
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)

  // Pessoa limitada a marcas só vê deal das marcas dela.
  const foraDaMarca = !!cabecalho && !!marcasPermitidas && !marcasPermitidas.includes(findBrandByMarca(cabecalho.row.marca)?.key ?? '')

  const diasTotal = timeline ? Math.max(1, timeline.totais.diasNoFunil) : 1
  const [larguraConteudo, setLarguraConteudo] = useState(0)
  const zoom = useZoomPan({ diasTotal, larguraViewport: largura, larguraConteudo })
  const layout = useMemo(
    () => timeline ? layoutPista(timeline, { k: zoom.k, x0: zoom.x0, largura }, zoom.nivel) : null,
    [timeline, zoom.k, zoom.x0, zoom.nivel, largura],
  )
  useEffect(() => { if (layout) setLarguraConteudo(layout.larguraConteudo) }, [layout])
  useEffect(() => { setSelecionadoId(null) }, [zoom.nivel, idDeal])

  const alvo = useMemo<AlvoPopover | null>(() => {
    if (!layout || !selecionadoId) return null
    const no = layout.nos.find(n => n.id === selecionadoId)
    if (no) return { tipo: 'no', no }
    const toque = layout.toques.find(t => t.id === selecionadoId)
    if (toque) return { tipo: 'toque', toque }
    const marcador = layout.marcadores.find(m => m.id === selecionadoId)
    return marcador ? { tipo: 'marcador', marcador } : null
  }, [layout, selecionadoId])

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
        ]}
        scope="parte da linha do tempo"
      />
      <DealHeader cabecalho={cabecalho} timeline={timeline} />
      <SCard style={{ marginTop: 20, position: 'relative' }} pad={22}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ws-text-primary)' }}>A Pista</div>
          <ZoomControls nivel={zoom.nivel} onMais={zoom.zoomIn} onMenos={zoom.zoomOut} onAjustar={zoom.ajustar} />
        </div>
        <div ref={ref} style={{ position: 'relative' }}>
          {layout && largura > 0 && (
            <div key={zoom.nivel} className="pista-fade">
              <PistaCanvas
                layout={layout}
                nivel={zoom.nivel}
                selecionadoId={selecionadoId}
                onSelecionar={setSelecionadoId}
                handlers={zoom.handlers}
                arrastando={zoom.arrastando}
                largura={largura}
              />
            </div>
          )}
          {alvo && <MomentoPopover alvo={alvo} timeline={timeline} idDeal={cabecalho.row.id_lead} onFechar={() => setSelecionadoId(null)} />}
        </div>
        <TimelineLegend nivel={zoom.nivel} />
        {timeline.totais.toques === 0 && timeline.totais.reunioes === 0 && (
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 8 }}>Sem tarefas nem reuniões registradas pra este deal.</div>
        )}
      </SCard>
      <style>{`
        .pista-fade { animation: pista-fade 250ms ease }
        @keyframes pista-fade { from { opacity: 0; transform: scale(.985) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { .pista-fade { animation: none } }
      `}</style>
    </div>
  )
}
