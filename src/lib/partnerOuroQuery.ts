/** Subconjunto de PostgREST utilizado pelos consumidores inventariados.
 * Falha explícita em operadores novos; nunca executa SQL ou recebe nome de tabela no DW. */
export type RecordRow = Record<string, unknown>
export const isPartner = (marca: unknown) => marca === 'We Scale' || marca === 'Scale Partner'

export function splitTerms(text: string): string[] {
  const terms: string[] = []
  let depth = 0, quoted = false, start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted) {
      if (text[i] === '(') depth++
      if (text[i] === ')') depth--
      if (text[i] === ',' && depth === 0) { terms.push(text.slice(start, i)); start = i + 1 }
    }
  }
  if (depth !== 0 || quoted) throw new Error('Filtro de dados inválido.')
  terms.push(text.slice(start))
  return terms.map(t => t.trim())
}
function plain(v: string) { return v.startsWith('"') ? JSON.parse(v) as string : v }
function comparable(v: unknown, ref: unknown): string | number | boolean | null {
  if (v == null) return null
  if (typeof ref === 'number') return Number(v)
  if (typeof ref === 'boolean') return v === true || v === 'true'
  // Postgres compara um timestamp sem fuso no fuso da conexão (UTC).
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const t = Date.parse(v.length === 19 ? `${v}Z` : v)
    if (!Number.isNaN(t)) return t
  }
  return String(v)
}
export function matches(row: RecordRow, field: string, expr: string): boolean {
  if (field === 'or' || field === 'and') {
    if (!expr.startsWith('(') || !expr.endsWith(')')) throw new Error('Filtro lógico inválido.')
    const tests = splitTerms(expr.slice(1, -1)).map(term => {
      const dot = term.indexOf('.')
      if (dot < 1) throw new Error('Filtro lógico inválido.')
      return matches(row, term.slice(0, dot), term.slice(dot + 1))
    })
    return field === 'or' ? tests.some(Boolean) : tests.every(Boolean)
  }
  if (!/^[a-z_][a-z0-9_]*$/i.test(field)) throw new Error('Coluna não suportada no filtro Partner.')
  const value = row[field]
  if (expr.startsWith('not.')) return value != null && !matches(row, field, expr.slice(4)) || expr === 'not.is.null' && value != null
  const dot = expr.indexOf('.'), op = expr.slice(0, dot), raw = expr.slice(dot + 1)
  if (dot < 1) throw new Error('Operador de filtro ausente.')
  if (op === 'is') {
    if (!['null', 'true', 'false'].includes(raw)) throw new Error('Filtro is inválido.')
    return raw === 'null' ? value == null : value === (raw === 'true')
  }
  if (value == null) return false
  if (op === 'in') {
    if (!raw.startsWith('(') || !raw.endsWith(')')) throw new Error('Filtro in inválido.')
    return splitTerms(raw.slice(1, -1)).some(x => String(value) === String(plain(x)))
  }
  if (op === 'ilike' || op === 'like') {
    const pattern = plain(raw).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*').replace(/_/g, '.')
    return new RegExp(`^${pattern}$`, op === 'ilike' ? 'i' : '').test(String(value))
  }
  const input = plain(raw)
  const timestamp = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
  const a = timestamp ? Date.parse(value) : comparable(value, value)
  const b = timestamp ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T00:00:00-03:00` : input.length === 19 ? `${input}-03:00` : input) : comparable(input, value)
  switch (op) {
    case 'eq': return a === b
    case 'neq': return a !== b
    case 'gte': return a! >= b!
    case 'lte': return a! <= b!
    case 'gt': return a! > b!
    case 'lt': return a! < b!
    default: throw new Error(`Filtro Partner não suportado: ${op}`)
  }
}
export function filterRows(rows: RecordRow[], params: URLSearchParams, legacyFunnel = false): RecordRow[] {
  const modifiers = new Set(['select', 'order', 'offset', 'limit'])
  return rows.filter(row => [...params].every(([key, value]) => {
    if (modifiers.has(key)) return true
    // O allowlist antigo não conhecia o funil Partner. A população ouro já
    // aplica seu próprio allowlist; não alargar a consulta das outras marcas.
    if (legacyFunnel && key === 'funil' && value === 'in.(SDR,Closer,Prospecção Ativa,Odonto Scale)') return true
    if (key === 'marca' && isPartner(row.marca)) {
      return matches({ ...row, marca: value.includes('Scale Partner') ? 'Scale Partner' : 'We Scale' }, key, value)
    }
    return matches(row, key, value)
  }))
}
export function sortRows(rows: RecordRow[], order: string | null): RecordRow[] {
  if (!order) return rows
  const specs = splitTerms(order).map(s => {
    const [field, direction = 'asc', nulls] = s.split('.')
    if (!/^[a-z_][a-z0-9_]*$/i.test(field) || !['asc', 'desc'].includes(direction) || nulls && !['nullsfirst', 'nullslast'].includes(nulls)) throw new Error('Ordenação Partner inválida.')
    return { field, desc: direction === 'desc', nullFirst: nulls ? nulls === 'nullsfirst' : direction === 'desc' }
  })
  return [...rows].sort((a, b) => {
    for (const s of specs) {
      const va = a[s.field], vb = b[s.field]
      if (va == null && vb == null) continue
      if (va == null) return s.nullFirst ? -1 : 1
      if (vb == null) return s.nullFirst ? 1 : -1
      const ca = comparable(va, vb), cb = comparable(vb, va)
      if (ca! < cb!) return s.desc ? 1 : -1
      if (ca! > cb!) return s.desc ? -1 : 1
    }
    return 0
  })
}
export function projectRows(rows: RecordRow[], select: string | null): RecordRow[] {
  if (!select || select === '*') return rows
  const fields = splitTerms(select)
  if (fields.some(f => !/^[a-z_][a-z0-9_]*$/i.test(f))) throw new Error('Projeção Partner não suportada.')
  return rows.map(row => Object.fromEntries(fields.map(f => [f, row[f] ?? null])))
}
export function mergePartnerRows(legacy: RecordRow[], gold: RecordRow[], ids: readonly string[], identity: string | null, params: URLSearchParams, legacyFunnel = false) {
  const known = new Set(ids)
  const kept = legacy.filter(r => !isPartner(r.marca) && !isPartner(r.marca_deal) && !(identity && known.has(String(r[identity]))))
  const partner = filterRows(gold, params, legacyFunnel)
  // As outras marcas conservam seus valores, sem normalização nem dedupe novo.
  return sortRows([...kept, ...partner], params.get('order'))
}
