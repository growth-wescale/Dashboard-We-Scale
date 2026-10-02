import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMetasClosers } from '@/hooks/useMetasClosers'
import { useSemanasCampanha } from '@/hooks/useSemanasCampanha'
import { diaDaCampanha, mesAtualCampanha, montarCampanha, voltaDoDia } from '@/constants/metasCampanhaF1'

const POOL_PREMIOS = 12000

/** Faixa temática discreta; reutiliza o realizado e as semanas da Campanha real. */
export function OctagonStrip() {
  const navigate = useNavigate()
  const mes = mesAtualCampanha()
  const { semanas } = useSemanasCampanha(mes)
  const campanha = useMemo(() => montarCampanha(mes, semanas), [mes, semanas])
  const { closers, loading } = useMetasClosers(mes)
  const lider = useMemo(() => [...closers].filter(c => c.metaFinanceira > 0)
    .sort((a, b) => b.pctAtingimento - a.pctAtingimento || b.realizado - a.realizado)[0], [closers])
  const dia = diaDaCampanha(campanha)
  const round = voltaDoDia(campanha, dia)
  const janela = campanha.voltas[round - 1]?.label.split('·')[1]?.trim()

  return <button type="button" className="oct-strip" onClick={() => navigate('/gp-setembro')} aria-label="Resumo da campanha de metas. Abrir campanha">
    <span className="oct-strip__title"><i aria-hidden="true" /> Octógono We Scale</span>
    <span className="oct-strip__chip">Round {round} de {campanha.voltas.length}{janela ? ` · ${janela}` : ''}</span>
    <span className="oct-strip__chip">{loading ? 'Carregando líder…' : lider ? `Líder Closer · ${lider.nome} · ${Math.round(lider.pctAtingimento)}%` : 'Aguardando metas do time'}</span>
    <span className="oct-strip__chip">{Math.max(0, campanha.diasMes - dia)} dias restantes</span>
    <span className="oct-strip__chip">Pool · R$ {POOL_PREMIOS.toLocaleString('pt-BR')}</span>
    <span className="oct-strip__link">Ver disputa →</span>
  </button>
}
