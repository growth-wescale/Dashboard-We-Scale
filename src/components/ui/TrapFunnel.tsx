/**
 * Funil visual em forma de funil (trapézios decrescentes), com conversão de
 * passagem, custo acumulado e badges de "repetidos" por etapa (modo
 * Passagens). Compartilhado entre a Visão Macro (subconjunto simplificado de
 * etapas) e Performance Detalhada (12 etapas).
 */

import { Repeat, CornerDownRight } from 'lucide-react'
import { money, nf } from '@/lib/format'

export interface FunnelStage { key: string; label: string; value: number }

export function TrapFunnel({ stages, invest, accent, dark, onStageClick, repeatedCounts, onRepeatClick, noShow, noShowRepeated = 0 }: {
  stages: FunnelStage[]; invest: number; accent: string; dark: string
  onStageClick?: (key: string) => void
  /** Repetidos por etapa — só preenchido em modo Passagens. */
  repeatedCounts?: Map<string, number>
  onRepeatClick?: (key: string) => void
  /** Deals que agendaram e não apareceram — sai do fluxo aqui, não é etapa do funil. */
  noShow?: number
  noShowRepeated?: number
}) {
  const v0 = Math.max(stages[0]?.value ?? 1, 1)
  const width = (v: number) => 30 + 70 * Math.sqrt(Math.max(0, v) / v0)

  function shade(i: number) {
    const pct = Math.max(38, 100 - i * 5)
    return `color-mix(in srgb, ${accent} ${pct}%, ${dark})`
  }

  return (
    <div>
      {stages.map((s, i) => {
        const last = i === stages.length - 1
        const wTop = width(s.value)
        const wBot = last ? wTop * 0.86 : width(stages[i + 1].value)
        const insetTop = (100 - wTop) / 2
        const insetBot = (100 - wBot) / 2
        // Pode passar de 100%: deals pulam etapas, então o funil não é monotônico.
        const conv = i > 0 && stages[i - 1].value > 0
          ? (s.value / stages[i - 1].value) * 100 : null
        const subiu = conv !== null && conv > 100
        const cost = invest > 0 && s.value > 0 ? invest / s.value : 0
        const repeated = repeatedCounts?.get(s.key) ?? 0

        return (
          <div key={s.key}>
            {i > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `1fr ${invest > 0 ? '150px' : '0px'}`, gap: 20, alignItems: 'center', padding: '7px 0' }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: subiu ? 'var(--status-positivo)' : 'var(--status-risco)', fontSize: 10 }}>
                      {subiu ? '▲' : '▼'}
                    </span>
                    {conv !== null ? conv.toFixed(1) : '—'}%
                  </span>
                </div>
                <div />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: `1fr ${invest > 0 ? '150px' : '0px'}`, gap: 20, alignItems: 'center' }}>
              <div style={{ position: 'relative', height: 46 }}>
                <div
                  onClick={onStageClick ? () => onStageClick(s.key) : undefined}
                  title={onStageClick ? `Ver deals em ${s.label}` : undefined}
                  style={{
                    position: 'absolute', inset: 0,
                    background: shade(i),
                    clipPath: `polygon(${insetTop}% 0, ${100 - insetTop}% 0, ${100 - insetBot}% 100%, ${insetBot}% 100%)`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1,
                    cursor: onStageClick ? 'pointer' : 'default',
                  }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                    {nf(s.value)}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 500, color: 'rgba(255,255,255,.88)' }}>
                    {s.label}
                  </span>
                </div>
              </div>
              {invest > 0 && (
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Custo / {s.label.split(' · ')[0]}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {s.value > 0 ? money(cost) : '—'}
                  </div>
                </div>
              )}
            </div>
            {repeated > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `1fr ${invest > 0 ? '150px' : '0px'}`, gap: 20, margin: '4px 0 6px' }}>
                <div style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onRepeatClick?.(s.key)}
                    title={`Ver os ${nf(repeated)} repetidos em ${s.label}`}
                    style={{
                      border: 'none', background: 'none', cursor: onRepeatClick ? 'pointer' : 'default', padding: 0,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10.5, fontWeight: 600, color: 'var(--status-atencao)', fontFamily: 'var(--font-body)',
                    }}>
                    <Repeat size={9} />
                    +{nf(repeated)} repetido{repeated !== 1 ? 's' : ''}
                  </button>
                </div>
                <div />
              </div>
            )}
            {s.key === 'Reunião Agendada SQL' && !!noShow && (
              <div style={{ display: 'grid', gridTemplateColumns: `1fr ${invest > 0 ? '150px' : '0px'}`, gap: 20, margin: '6px 0 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div
                    onClick={onRepeatClick && noShowRepeated ? () => onRepeatClick('No Show') : undefined}
                    title="Agendaram e não apareceram — sai do fluxo aqui, não conta como etapa do funil"
                    style={{
                      width: `${width(noShow)}%`,
                      border: '1.5px dashed #000', borderRadius: 8, background: 'transparent',
                      padding: '5px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                      lineHeight: 1.25, cursor: onRepeatClick && noShowRepeated ? 'pointer' : 'default',
                    }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 11.5, fontWeight: 700, color: 'var(--ws-text-primary)', whiteSpace: 'nowrap',
                    }}>
                      <CornerDownRight size={11} />
                      No-show · {nf(noShow)}
                    </span>
                    {noShowRepeated > 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2,
                        fontSize: 10, fontWeight: 600, color: 'var(--status-atencao)', whiteSpace: 'nowrap',
                      }}>
                        <Repeat size={8} />
                        +{nf(noShowRepeated)} repetido{noShowRepeated !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
