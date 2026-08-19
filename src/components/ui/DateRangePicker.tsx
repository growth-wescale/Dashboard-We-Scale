/**
 * Seletor de range de dias — calendário + atalhos, no lugar dos dois
 * `<input type="date">` que exigiam abrir o calendário nativo duas vezes
 * (início, depois fim) pra escolher qualquer período no modo Dia.
 *
 * Clicar num atalho aplica na hora. Escolher manualmente no calendário exige
 * confirmar em "Aplicar" — sem isso, o segundo clique (fim) já aplicaria a
 * seleção, sem chance de revisar antes de fechar o popover.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { isoDate, todayLocal } from '@/lib/dateUtils'
import { PISO_PERIODO } from '@/lib/periodo'
import type { DateRange } from '@/lib/periodo'
import { controlStyle, labelStyle } from './MultiSelect'

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES_LONGO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const pad = (n: number) => String(n).padStart(2, '0')

function addDias(d: Date, n: number): Date {
  const copia = new Date(d)
  copia.setDate(copia.getDate() + n)
  return copia
}

interface Atalho { label: string; range: () => DateRange }

const ATALHOS: Atalho[] = [
  { label: 'Hoje', range: () => { const h = todayLocal(); return { start: h, end: h } } },
  { label: 'Ontem', range: () => { const o = isoDate(addDias(new Date(), -1)); return { start: o, end: o } } },
  {
    label: 'Esta semana',
    range: () => {
      const hoje = new Date()
      const inicioSemana = addDias(hoje, -hoje.getDay()) // domingo mais recente
      return { start: isoDate(inicioSemana), end: todayLocal() }
    },
  },
  { label: 'Últimos 7 dias', range: () => ({ start: isoDate(addDias(new Date(), -6)), end: todayLocal() }) },
  { label: 'Últimos 30 dias', range: () => ({ start: isoDate(addDias(new Date(), -29)), end: todayLocal() }) },
]

interface Celula { iso: string; dia: number; noMes: boolean }

/** Grade de 6 semanas (dom–sáb) cobrindo o mês, com dias vizinhos pra preencher. */
function gradeDoMes(mesKey: string): Celula[] {
  const [y, m] = mesKey.split('-').map(Number)
  const primeiroDiaSemana = new Date(y, m - 1, 1).getDay()
  const totalDias = new Date(y, m, 0).getDate()
  const celulas: Celula[] = []

  for (let i = primeiroDiaSemana; i > 0; i--) {
    const d = new Date(y, m - 1, 1 - i)
    celulas.push({ iso: isoDate(d), dia: d.getDate(), noMes: false })
  }
  for (let dia = 1; dia <= totalDias; dia++) {
    celulas.push({ iso: `${mesKey}-${pad(dia)}`, dia, noMes: true })
  }
  while (celulas.length < 42) {
    const d = new Date(y, m - 1, celulas.length - primeiroDiaSemana + 1)
    celulas.push({ iso: isoDate(d), dia: d.getDate(), noMes: false })
  }
  return celulas
}

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [viewMes, setViewMes] = useState(value.end.slice(0, 7))
  const [draftStart, setDraftStart] = useState<string | null>(value.start)
  const [draftEnd, setDraftEnd] = useState<string | null>(value.end)
  const box = useRef<HTMLDivElement>(null)
  const hojeIso = todayLocal()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function abrir() {
    setDraftStart(value.start)
    setDraftEnd(value.end)
    setViewMes(value.end.slice(0, 7))
    setOpen(o => !o)
  }

  function clicarDia(iso: string) {
    if (iso > hojeIso) return // dia futuro não é selecionável
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(iso)
      setDraftEnd(null)
    } else if (iso < draftStart) {
      setDraftEnd(draftStart)
      setDraftStart(iso)
    } else {
      setDraftEnd(iso)
    }
  }

  function aplicarAtalho(a: Atalho) {
    const r = a.range()
    onChange(r)
    setOpen(false)
  }

  function aplicar() {
    if (!draftStart || !draftEnd) return
    onChange({ start: draftStart, end: draftEnd })
    setOpen(false)
  }

  const grade = useMemo(() => gradeDoMes(viewMes), [viewMes])
  const podeVoltar = viewMes > PISO_PERIODO
  const podeAvancar = viewMes < hojeIso.slice(0, 7)

  const mudarMes = (delta: number) => {
    const [y, m] = viewMes.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setViewMes(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }

  const rotulo = value.start === value.end
    ? fmtBR(value.start)
    : `${fmtBR(value.start)} – ${fmtBR(value.end)}`

  const dica = !draftStart ? 'Selecione a data inicial' : !draftEnd ? 'Selecione a data final' : `${fmtBR(draftStart)} – ${fmtBR(draftEnd)}`

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={abrir}
        style={{ ...controlStyle, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        <Calendar size={13} style={{ opacity: .6, flexShrink: 0 }} />
        {rotulo}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 1100,
          background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
          borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,.12))',
          display: 'flex', overflow: 'hidden',
        }}>
          <div style={{ width: 150, padding: 10, borderRight: '1px solid var(--ws-border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ ...labelStyle, padding: '4px 6px 6px' }}>Atalhos</div>
            {ATALHOS.map(a => (
              <button
                key={a.label}
                type="button"
                onClick={() => aplicarAtalho(a)}
                style={{
                  border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer',
                  padding: '6px 8px', borderRadius: 4, fontSize: 12.5, color: 'var(--ws-text-primary)',
                  fontFamily: 'var(--font-body)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--ws-bg)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div style={{ padding: 14, width: 296 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button type="button" onClick={() => mudarMes(-1)} disabled={!podeVoltar}
                style={{ border: 'none', background: 'none', cursor: podeVoltar ? 'pointer' : 'default', opacity: podeVoltar ? 1 : .3, padding: 4, display: 'flex' }}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--ws-text-primary)' }}>
                {MESES_LONGO[Number(viewMes.slice(5, 7)) - 1]} {viewMes.slice(0, 4)}
              </span>
              <button type="button" onClick={() => mudarMes(1)} disabled={!podeAvancar}
                style={{ border: 'none', background: 'none', cursor: podeAvancar ? 'pointer' : 'default', opacity: podeAvancar ? 1 : .3, padding: 4, display: 'flex' }}>
                <ChevronRight size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {DIAS_SEMANA.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--ws-text-secondary)', textTransform: 'uppercase' }}>{d}</div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {grade.map(c => {
                const futuro = c.iso > hojeIso
                const noRange = !!draftStart && !!draftEnd && c.iso >= draftStart && c.iso <= draftEnd
                const isBorda = c.iso === draftStart || c.iso === draftEnd
                return (
                  <button
                    key={c.iso}
                    type="button"
                    disabled={futuro}
                    onClick={() => clicarDia(c.iso)}
                    style={{
                      border: 'none', borderRadius: isBorda ? 6 : noRange ? 0 : 6,
                      height: 30, fontSize: 12.5, fontFamily: 'var(--font-body)',
                      cursor: futuro ? 'default' : 'pointer',
                      background: isBorda ? 'var(--brand-accent, #2ABCB5)' : noRange ? 'color-mix(in srgb, var(--brand-accent, #2ABCB5) 16%, transparent)' : 'transparent',
                      color: futuro ? 'var(--ws-text-secondary)' : isBorda ? '#fff' : !c.noMes ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)',
                      opacity: futuro ? .35 : !c.noMes ? .55 : 1,
                      fontWeight: c.iso === hojeIso && !isBorda ? 700 : 400,
                    }}
                  >
                    {c.dia}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 10 }}>
              <span style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)' }}>{dica}</span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => { setDraftStart(null); setDraftEnd(null) }}
                  style={{ ...controlStyle, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
                  Limpar
                </button>
                <button type="button" onClick={aplicar} disabled={!draftStart || !draftEnd}
                  style={{
                    border: 'none', borderRadius: 'var(--radius-sm)', padding: '5px 12px', fontSize: 12, fontWeight: 600,
                    background: 'var(--brand-accent, #2ABCB5)', color: '#fff',
                    cursor: draftStart && draftEnd ? 'pointer' : 'default',
                    opacity: draftStart && draftEnd ? 1 : .5,
                  }}>
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function fmtBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
