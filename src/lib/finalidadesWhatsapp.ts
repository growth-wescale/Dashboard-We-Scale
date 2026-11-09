// Os totais da ouro usam dias de Brasília. Um dia UTC de modelo inclui
// parte de dois dias locais: o anterior (a partir das 21h) e o próprio.
export interface ContaEnvios {
  conta: string; marca: string; dia: string; enviados: number | null
  entrega_completa: boolean | null
}
export interface EvidenciaEnvio {
  conta: string; marca: string; dia: string; tipo: 'rotina' | 'evento'; enviados: number
}
export interface DivisaoEnvios {
  marca: string; total: number | null; rotina: number | null; evento: number | null; pendente: number | null
}
function anterior(dia: string) {
  const data = new Date(dia + 'T12:00:00Z')
  data.setUTCDate(data.getUTCDate() - 1)
  return data.toISOString().slice(0, 10)
}
interface Janela { dia: string; rotina: number; evento: number }

function reconciliar(janelas: Janela[], dias: Map<string, ContaEnvios>) {
  // Teste de compatibilidade, sem inventar o horário individual do envio.
  // Componentes usam dias locais disjuntos. Dentro de cada um, consumir a
  // capacidade mais antiga primeiro deixa o máximo disponível ao próximo dia.
  let rotina = 0, evento = 0
  for (let i = 0; i < janelas.length;) {
    let saldo = dias.get(anterior(janelas[i].dia))!.enviados!
    let r = 0, e = 0, compativel = true
    for (;;) {
      const j = janelas[i++]
      const necessario = Math.max(0, j.rotina + j.evento - saldo)
      saldo = dias.get(j.dia)!.enviados! - necessario
      if (saldo < 0) compativel = false
      r += j.rotina
      e += j.evento
      if (i === janelas.length || anterior(janelas[i].dia) !== j.dia) break
    }
    if (compativel) { rotina += r; evento += e }
  }
  return { rotina, evento }
}

export function dividirEnvios(contas: ContaEnvios[], evidencias: EvidenciaEnvio[], inicio: string, fim: string, marca = ''): DivisaoEnvios[] {
  const porMarca = new Map<string, DivisaoEnvios>()
  const porConta = new Map<string, Map<string, ContaEnvios>>()
  for (const row of contas) {
    if (marca && row.marca !== marca) continue
    if (!porMarca.has(row.marca)) porMarca.set(row.marca, { marca: row.marca, total: null, rotina: null, evento: null, pendente: null })
    if (row.dia < inicio || row.dia > fim || row.enviados === null) continue
    if (!porConta.has(row.conta)) porConta.set(row.conta, new Map())
    const dias = porConta.get(row.conta)!
    if (dias.has(row.dia) || !Number.isSafeInteger(row.enviados) || row.enviados < 0) throw new Error('Total da conta inválido')
    dias.set(row.dia,row)
    const m = porMarca.get(row.marca)!
    m.total = (m.total ?? 0) + row.enviados
    m.rotina ??= 0
    m.evento ??= 0
  }
  const porWaba = new Map<string, Map<string, Janela>>()
  const vistos = new Set<string>()
  for (const ev of evidencias) {
    const dias = porConta.get(ev.conta)
    const antes = dias?.get(anterior(ev.dia)), atual = dias?.get(ev.dia)
    if (!antes?.entrega_completa || !atual?.entrega_completa || antes.marca !== ev.marca || atual.marca !== ev.marca) continue
    const chave = JSON.stringify([ev.conta,ev.dia,ev.tipo])
    if (vistos.has(chave) || !Number.isSafeInteger(ev.enviados) || ev.enviados < 0) throw new Error('Evidência de envio inválida')
    vistos.add(chave)
    if (!ev.enviados) continue
    if (!porWaba.has(ev.conta)) porWaba.set(ev.conta,new Map())
    const mapa = porWaba.get(ev.conta)!
    const j = mapa.get(ev.dia) ?? { dia: ev.dia, rotina: 0, evento: 0 }
    j[ev.tipo] += ev.enviados
    mapa.set(ev.dia,j)
  }
  for (const [conta,mapa] of porWaba) {
    const dias = porConta.get(conta)!
    // Se a atribuição da conta mudar de marca, reconciliar os blocos por marca.
    const nomes = new Set([...mapa.keys()].map(d=>dias.get(d)!.marca))
    for (const nome of nomes) {
      const janelas = [...mapa.values()].filter(j=>dias.get(j.dia)!.marca===nome).sort((a,b)=>a.dia.localeCompare(b.dia))
      const aceito = reconciliar(janelas,dias), m = porMarca.get(nome)!
      m.rotina! += aceito.rotina
      m.evento! += aceito.evento
    }
  }
  for (const m of porMarca.values()) if (m.total !== null) m.pendente = m.total - m.rotina! - m.evento!
  return [...porMarca.values()].sort((a,b)=>a.marca.localeCompare(b.marca))
}
