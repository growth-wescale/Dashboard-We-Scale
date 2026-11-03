/**
 * Armazenamento local das bases ao vivo (IndexedDB do navegador).
 *
 * É só aceleração: qualquer falha (aba anônima, cota cheia, navegador sem
 * IndexedDB) vira "não tem nada guardado" e a base vem do banco, como antes.
 * Toda operação tem prazo: há navegador em que o IndexedDB simplesmente não
 * responde, e esperar por ele travaria a carga da página.
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
/** Prazo de cada operação; passou disso, segue como se não houvesse nada guardado. */
export const PRAZO_ARMAZEM_MS = 3_000

/** `promessa` ou, se ela demorar mais que `ms` (ou falhar), `padrao`. */
export function comPrazo<T>(promessa: Promise<T>, padrao: T, ms = PRAZO_ARMAZEM_MS): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(padrao), ms)
    promessa.then(
      valor => { clearTimeout(timer); resolve(valor) },
      () => { clearTimeout(timer); resolve(padrao) },
    )
  })
}

let conexao: Promise<IDBDatabase | null> | null = null

function abrirBanco(): Promise<IDBDatabase | null> {
  return new Promise<IDBDatabase | null>(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(BANCO, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: 'nome' })
      }
      req.onsuccess = () => {
        const db = req.result
        // Outra aba abriu uma versão nova, ou o navegador fechou a conexão:
        // a próxima operação abre de novo.
        db.onversionchange = () => { db.close(); conexao = null }
        db.onclose = () => { conexao = null }
        resolve(db)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function abrir(): Promise<IDBDatabase | null> {
  if (!conexao) {
    const tentativa = comPrazo(abrirBanco(), null).then(db => {
      // Sem banco (erro ou prazo): não guarda a falha, a próxima chamada tenta de novo.
      if (!db && conexao === tentativa) conexao = null
      return db
    })
    conexao = tentativa
  }
  return conexao
}

export async function lerRegistro(nome: string): Promise<RegistroLocal | null> {
  const db = await abrir()
  if (!db) return null
  return comPrazo(new Promise<RegistroLocal | null>(resolve => {
    try {
      const req = db.transaction(LOJA, 'readonly').objectStore(LOJA).get(nome)
      req.onsuccess = () => resolve((req.result as RegistroLocal | undefined) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  }), null)
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
    await comPrazo(concluir(tx), undefined, PRAZO_ARMAZEM_MS * 3)
  } catch {
    // ignora: sem armazenamento local a base continua vindo do banco
  }
}

/** Apaga tudo (logout, troca de usuário, usuário que não pode guardar). */
export async function apagarRegistros(): Promise<void> {
  const db = await abrir()
  if (!db) return
  try {
    const tx = db.transaction(LOJA, 'readwrite')
    tx.objectStore(LOJA).clear()
    await comPrazo(concluir(tx), undefined)
  } catch {
    // ignora
  }
}
