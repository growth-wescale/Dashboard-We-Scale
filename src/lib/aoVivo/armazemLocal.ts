/**
 * Armazenamento local das bases ao vivo (IndexedDB do navegador).
 *
 * É só aceleração: qualquer falha (aba anônima, cota cheia, navegador sem
 * IndexedDB) vira "não tem nada guardado" e a base vem do banco, como antes.
 */

export interface RegistroLocal {
  nome: string
  /** Muda junto com a lista de colunas ou o jeito de montar: registro de outro formato é ignorado. */
  formato: string
  /** Usuário dono (id do Supabase de Marketing): outro login no mesmo navegador não reaproveita. */
  usuario: string
  epoca: number
  versao: number
  cols: string[]
  linhas: unknown[][]
  atualizadoEm: string | null
  salvoEm: number
}

const BANCO = 'ws-dashboard-ao-vivo'
const LOJA = 'bases'

let conexao: Promise<IDBDatabase | null> | null = null

function abrir(): Promise<IDBDatabase | null> {
  if (conexao) return conexao
  conexao = new Promise<IDBDatabase | null>(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(BANCO, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: 'nome' })
      }
      req.onsuccess = () => {
        const db = req.result
        // Outra aba abriu uma versão nova do banco local: solta esta conexão.
        db.onversionchange = () => { db.close(); conexao = null }
        resolve(db)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return conexao
}

export async function lerRegistro(nome: string): Promise<RegistroLocal | null> {
  const db = await abrir()
  if (!db) return null
  return new Promise(resolve => {
    try {
      const req = db.transaction(LOJA, 'readonly').objectStore(LOJA).get(nome)
      req.onsuccess = () => resolve((req.result as RegistroLocal | undefined) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function concluir(tx: IDBTransaction): Promise<void> {
  return new Promise(resolve => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

export async function gravarRegistro(registro: RegistroLocal): Promise<void> {
  const db = await abrir()
  if (!db) return
  try {
    const tx = db.transaction(LOJA, 'readwrite')
    tx.objectStore(LOJA).put(registro)
    await concluir(tx)
  } catch {
    // ignora: sem armazenamento local a base continua vindo do banco
  }
}

/** Apaga tudo (logout ou troca de usuário). */
export async function apagarRegistros(): Promise<void> {
  const db = await abrir()
  if (!db) return
  try {
    const tx = db.transaction(LOJA, 'readwrite')
    tx.objectStore(LOJA).clear()
    await concluir(tx)
  } catch {
    // ignora
  }
}
