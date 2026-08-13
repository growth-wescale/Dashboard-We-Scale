/** Baixa um array de objetos como CSV via Blob. Sem deps.
 *  - Escapa aspas e quebras de linha em campos.
 *  - Usa `;` como separador (padrão Excel BR).
 *  - Aceita array vazio (não faz nada nesse caso).
 */
export function downloadCsv<T extends object>(
  rows: T[],
  filename: string,
  columns?: Array<keyof T>,
): void {
  if (!rows.length) return

  const cols = (columns ?? Object.keys(rows[0] as object) as Array<keyof T>) as string[]
  const header = cols.join(';')
  const body = rows.map(r => cols.map(c => escape((r as Record<string, unknown>)[c as string])).join(';')).join('\n')
  // BOM UTF-8 pra Excel abrir com acentos corretos
  const csv = '﻿' + header + '\n' + body

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function escape(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v)
  if (/["\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}
