import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { BRAND_OVERVIEW, findBrandByMarca } from '@/constants/brands'
import { fmtBR } from '@/lib/dateUtils'
import { brl, num, type ConsumoMarcas } from '@/lib/consumoWhatsapp'

type Metrica = 'custo' | 'enviados' | 'entregues'
function cor(marca: string) {
  if (marca === 'We Scale') return BRAND_OVERVIEW.dark
  const brand = findBrandByMarca(marca)
  return brand ? `color-mix(in srgb, ${brand.accent} 65%, ${brand.dark})` : 'var(--ws-text-secondary)'
}

function passoEixo(max: number) {
  const bruto = (max || 4) / 4
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  return ([1, 2, 2.5, 5, 10].find(n => n * potencia >= bruto) ?? 10) * potencia
}

function Linhas({ consumo, metrica, titulo }: { consumo: ConsumoMarcas; metrica: Metrica; titulo: string }) {
  const { dias, series } = consumo
  const [selecao, selecionar] = useState<string | null>(null)
  const [largura, setLargura] = useState(800)
  const area = useRef<HTMLDivElement>(null)
  const descricao = useId()
  useEffect(() => {
    if (!area.current) return
    const observer = new ResizeObserver(([entry]) => setLargura(Math.max(200, entry.contentRect.width)))
    observer.observe(area.current)
    return () => observer.disconnect()
  }, [])
  const visiveis = series.filter(s => s.pontos.some(p => p[metrica] !== null))
  const max = Math.max(0, ...visiveis.flatMap(s => s.pontos.map(p => p[metrica] ?? 0)))
  const passo = metrica === 'custo' ? passoEixo(max) : Math.max(1, Math.ceil(passoEixo(max)))
  const teto = Math.max(passo, Math.ceil(max / passo) * passo)
  const left = 54, right = 24, top = 24, base = 210, height = 241
  const util = largura - left - right
  const x = (i: number) => left + (dias.length === 1 ? util / 2 : i * util / Math.max(1, dias.length - 1))
  const y = (v: number) => base - v / teto * (base - top)
  const salto = Math.max(1, Math.ceil(dias.length / Math.max(2, Math.floor(util / 76))))
  const ativo = selecao === null ? -1 : dias.indexOf(selecao)
  const formatar = metrica === 'custo' ? brl : num
  const pico = visiveis.flatMap(s => {
    const indice = s.pontos.findIndex(p => p[metrica] === max)
    return indice === -1 ? [] : [indice]
  })[0]
  function consultarDia(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const indice = Math.round(((event.clientX - rect.left) * largura / rect.width - left) / util * (dias.length - 1))
    selecionar(dias[Math.max(0, Math.min(dias.length - 1, indice))])
  }
  return <div className="wa-plot" ref={area}>
    {visiveis.length === 0 ? <p className="wa-no-series">Sem medição no período selecionado.</p> : <>
      <div className="wa-legend">{visiveis.map(s => <span key={s.marca}><i style={{ background: cor(s.marca) }}/>{s.marca}</span>)}</div>
      <svg role="img" aria-label={titulo} aria-describedby={descricao} tabIndex={0} width="100%" height={height}
        viewBox={`0 0 ${largura} ${height}`} onPointerMove={consultarDia} onPointerDown={e => {
          e.currentTarget.focus()
          consultarDia(e)
        }} onFocus={()=>selecionar(dias[0])} onBlur={()=>selecionar(null)}
        onKeyDown={e=>{
          if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return
          e.preventDefault()
          const i=e.key==='Home'?0:e.key==='End'?dias.length-1:Math.max(0,ativo)+(e.key==='ArrowRight'?1:-1)
          selecionar(dias[Math.max(0,Math.min(dias.length-1,i))])
        }}>
        {Array.from({ length: Math.round(teto / passo) + 1 }, (_, i) => <g key={i}>
          <line x1={left} x2={largura-right} y1={y(i*passo)} y2={y(i*passo)} className="wa-gridline"/>
          <text x={left-8} y={y(i*passo)+4} textAnchor="end">{(i*passo).toLocaleString('pt-BR',{maximumFractionDigits:2})}</text>
        </g>)}
        {dias.map((dia,i)=>(i===dias.length-1 || (i%salto===0 && i<dias.length-1-salto/2)) &&
          <text key={dia} x={x(i)} y={height-7} textAnchor="middle">{fmtBR(dia).slice(0,5)}</text>)}
        {ativo>=0 && <line x1={x(ativo)} x2={x(ativo)} y1={top} y2={base} className="wa-guide"/>}
        {visiveis.map(s=>{
          const path=s.pontos.map((p,i)=>{
            const valor=p[metrica]
            if(valor===null) return ''
            return `${i && s.pontos[i-1][metrica]!==null?'L':'M'}${x(i)},${y(valor)}`
          }).join(' ')
          return <g key={s.marca} data-marca={s.marca} stroke={cor(s.marca)}>
            <path d={path} fill="none" strokeWidth="2" strokeLinejoin="round"/>
            {s.pontos.map((p,i)=>p[metrica]!==null && <circle key={dias[i]} cx={x(i)} cy={y(p[metrica])} r={i===ativo?4:2}
              fill={i===ativo?cor(s.marca):'var(--ws-surface)'}><title>{s.marca} · {fmtBR(dias[i])} · {formatar(p[metrica])}</title></circle>)}
          </g>
        })}
        {max > 0 && pico !== undefined && <text className="wa-peak" x={Math.max(left, Math.min(x(pico), largura - 60))}
          y={y(max) - 9} textAnchor="middle">{formatar(max)}</text>}
      </svg>
      <div className="wa-day-detail" id={descricao} aria-live="polite">{ativo<0
        ? 'Passe o cursor, toque no gráfico ou use as setas para consultar um dia.'
        : <><strong>{fmtBR(dias[ativo])}</strong>{visiveis.map(s=><span key={s.marca}><i style={{background:cor(s.marca)}}/>{s.marca} <b>{formatar(s.pontos[ativo][metrica])}</b></span>)}</>}</div>
    </>}
  </div>
}

export function GraficosWhatsapp({ consumo }: { consumo: ConsumoMarcas }) {
  const [mensagens, setMensagens] = useState<'enviados' | 'entregues'>('enviados')
  const barras = consumo.series.filter(s=>s.custo!==null)
  const maior = Math.max(0,...barras.map(s=>s.custo!))
  return <>
    <section className="wa-section wa-chart"><header><h2>Custo diário por marca</h2><span>Custo estimado · R$</span></header>
      <Linhas consumo={consumo} metrica="custo" titulo="Custo diário por marca em reais"/>
    </section>
    <section className="wa-section wa-chart"><header><h2>Custo por marca</h2><span>Total estimado no período · R$</span></header>
      {barras.length ? <div className="wa-bars-scroll"><div className="wa-bars" style={{minWidth:barras.length*106}} aria-label="Custo por marca no período">
        {barras.map(s=><div className="wa-bar-col" key={s.marca}>
          <div className="wa-bar-area"><div className="wa-bar" style={{'--wa-bar-size': `${maior ? 100*s.custo!/maior : 0}%`} as CSSProperties}>
            <b>{brl(s.custo)}</b></div></div><span>{s.marca}</span>
        </div>)}
      </div></div> : <p className="wa-no-series">Sem medição de custo no período selecionado.</p>}
    </section>
    <section className="wa-section wa-chart"><header><h2>Mensagens por dia</h2>
      <div className="wa-toggle" role="group" aria-label="Métrica de mensagens">{(['enviados','entregues'] as const).map(tipo=>
        <button key={tipo} type="button" aria-pressed={mensagens===tipo} onClick={()=>setMensagens(tipo)}>{tipo==='enviados'?'Enviadas':'Entregues'}</button>)}</div></header>
      <Linhas consumo={consumo} metrica={mensagens} titulo={mensagens==='enviados'?'Mensagens enviadas por dia':'Mensagens entregues por dia'}/>
    </section>
  </>
}
