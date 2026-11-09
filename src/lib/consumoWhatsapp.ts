export type DiaConta = {
  conta: string; marca: string; dia: string; enviados: number | null; entregues: number | null
  precificados: number | null; custo: number | null; sem_tarifa: number
  entrega_ok: boolean; preco_ok: boolean; parcial: boolean; erro: boolean; vazio: boolean
  entrega_completa: boolean | null; observado: string | null
}

export const brl = (v: number | null) => v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const num = (v: number | null) => v === null ? '—' : v.toLocaleString('pt-BR')

export function soma(values: (number | null)[]) {
  const known = values.filter((v): v is number => v !== null)
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}
export function custo(rows: DiaConta[]) {
  return rows.some(r => r.sem_tarifa > 0) ? null : soma(rows.map(r => r.custo))
}

export function consumoPorMarca(rows: DiaConta[], marcas: string[], inicio: string, fim: string) {
  const dias: string[] = []
  for (let t = Date.parse(inicio); t <= Date.parse(fim); t += 86400000) {
    dias.push(new Date(t).toISOString().slice(0, 10))
  }
  const series = marcas.map(marca => {
    const registros = rows.filter(r => r.marca === marca)
    const porDia = new Map<string, DiaConta[]>()
    for (const r of registros) {
      if (!porDia.has(r.dia)) porDia.set(r.dia, [])
      porDia.get(r.dia)!.push(r)
    }
    const medidos = registros.filter(r => r.observado && (r.entrega_ok || r.preco_ok))
    const ultima = medidos.reduce((max, r) => Math.max(max, Date.parse(r.observado!)), 0)
    return {
      marca, ultima, custo: custo(registros),
      enviados: soma(registros.map(r => r.enviados)), entregues: soma(registros.map(r => r.entregues)),
      pontos: dias.map(dia => {
        const grupo = porDia.get(dia) ?? []
        return { custo: custo(grupo), enviados: soma(grupo.map(r => r.enviados)), entregues: soma(grupo.map(r => r.entregues)) }
      }),
    }
  })
  return { dias, series }
}
export type ConsumoMarcas = ReturnType<typeof consumoPorMarca>
