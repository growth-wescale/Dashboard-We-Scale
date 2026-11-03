import { describe, expect, it } from 'vitest'
import {
  criarCanal, CONFERENCIA_COM_CANAL_MS, CONFERENCIA_SEM_CANAL_MS, ESPERA_FECHAR_MS, INTERVALO_MIN_AVISOS_MS,
  JUNTAR_AVISOS_MS, REABRIR_MS,
  type AvisoVersao, type Sincronizavel,
} from './canal'

/** Relógio falso: `avancar(ms)` roda, em ordem, o que estava agendado até lá. */
function relogio() {
  let agora = 0
  let seq = 0
  const fila: { em: number; seq: number; fn: () => void }[] = []
  return {
    agora: () => agora,
    pendentes: () => fila.length,
    agendar(fn: () => void, ms: number) {
      const item = { em: agora + ms, seq: seq++, fn }
      fila.push(item)
      return () => { const i = fila.indexOf(item); if (i >= 0) fila.splice(i, 1) }
    },
    avancar(ms: number) {
      const alvo = agora + ms
      for (;;) {
        fila.sort((a, b) => a.em - b.em || a.seq - b.seq)
        const proximo = fila[0]
        if (!proximo || proximo.em > alvo) break
        fila.shift()
        agora = proximo.em
        proximo.fn()
      }
      agora = alvo
    },
  }
}

interface ConexaoFalsa { aviso: (a: AvisoVersao) => void; status: (s: string) => void; fechada: number }

/**
 * `fecharDevolveClosed` imita o Supabase de verdade: `removeChannel` chama de
 * novo, na hora, o callback de status com 'CLOSED'.
 */
function montar(opts: { fecharDevolveClosed?: boolean } = {}) {
  const r = relogio()
  const conexoes: ConexaoFalsa[] = []
  const canal = criarCanal({
    abrir(aoAviso, aoStatus) {
      const c: ConexaoFalsa = { aviso: aoAviso, status: aoStatus, fechada: 0 }
      conexoes.push(c)
      return {
        fechar: () => {
          c.fechada++
          if (c.fechada > 50) throw new Error('laço no fechar')
          if (opts.fecharDevolveClosed) aoStatus('CLOSED')
        },
      }
    },
    agendar: r.agendar,
    agora: r.agora,
    aleatorio: () => 0,
  })
  return { canal, r, conexoes }
}

function baseFalsa(versao: number | null = 1, epoca: number | null = 1) {
  const b = { versao, epoca, chamadas: 0 }
  const s: Sincronizavel = { obter: () => ({ versao: b.versao, epoca: b.epoca }), sincronizar: async () => { b.chamadas++ } }
  return { b, s }
}

describe('canal ao vivo', () => {
  it('abre ao ativar a 1ª base e fica ao vivo quando o Supabase confirma', () => {
    const { canal, conexoes } = montar()
    canal.ativar(baseFalsa().s)
    expect(conexoes).toHaveLength(1)
    expect(canal.status()).toBe('conectando')
    conexoes[0].status('SUBSCRIBED')
    expect(canal.status()).toBe('ao-vivo')
  })

  it('aviso de versão nova sincroniza só quem está atrás, juntando rajadas', () => {
    const { canal, r, conexoes } = montar()
    const atras = baseFalsa(4)
    const emDia = baseFalsa(7)
    canal.ativar(atras.s)
    canal.ativar(emDia.s)
    conexoes[0].status('SUBSCRIBED')
    conexoes[0].aviso({ versao: 6 })
    conexoes[0].aviso({ versao: 7 })
    r.avancar(JUNTAR_AVISOS_MS)
    expect(atras.b.chamadas).toBe(1)
    expect(emDia.b.chamadas).toBe(0)
  })

  it('aviso sem número de versão é ignorado', () => {
    const { canal, r, conexoes } = montar()
    const base = baseFalsa(1)
    canal.ativar(base.s)
    conexoes[0].aviso({ versao: 'x' })
    r.avancar(JUNTAR_AVISOS_MS)
    expect(base.b.chamadas).toBe(0)
  })

  it('no máximo uma busca por aviso a cada 5 s (canal público aceita aviso de qualquer um)', () => {
    const { canal, r, conexoes } = montar()
    const base = baseFalsa(1)
    canal.ativar(base.s)
    conexoes[0].status('SUBSCRIBED')
    conexoes[0].aviso({ versao: 2 })
    r.avancar(JUNTAR_AVISOS_MS)
    expect(base.b.chamadas).toBe(1)
    conexoes[0].aviso({ versao: 3 })
    r.avancar(INTERVALO_MIN_AVISOS_MS - JUNTAR_AVISOS_MS - 1)
    expect(base.b.chamadas).toBe(1)
    r.avancar(JUNTAR_AVISOS_MS + 1)
    expect(base.b.chamadas).toBe(2)
  })

  it('aviso forjado com versão enorme não fica valendo para os seguintes', () => {
    const { canal, r, conexoes } = montar()
    const base = baseFalsa(5)
    canal.ativar(base.s)
    conexoes[0].status('SUBSCRIBED')
    conexoes[0].aviso({ versao: 1e12 })
    r.avancar(JUNTAR_AVISOS_MS)
    expect(base.b.chamadas).toBe(1)
    conexoes[0].aviso({ versao: 5 })
    r.avancar(INTERVALO_MIN_AVISOS_MS * 2)
    expect(base.b.chamadas).toBe(1)
  })

  it('aviso de outra época (recarga forçada) sincroniza mesmo na mesma versão', () => {
    const { canal, r, conexoes } = montar()
    const base = baseFalsa(5, 1)
    canal.ativar(base.s)
    conexoes[0].status('SUBSCRIBED')
    conexoes[0].aviso({ versao: 5, epoca: 2 })
    r.avancar(JUNTAR_AVISOS_MS)
    expect(base.b.chamadas).toBe(1)
  })

  it('sem canal confere a cada 30 s; com canal, a cada 5 min', () => {
    const { canal, r, conexoes } = montar()
    const base = baseFalsa()
    canal.ativar(base.s)
    conexoes[0].status('CHANNEL_ERROR')
    expect(canal.status()).toBe('sem-canal')
    r.avancar(CONFERENCIA_SEM_CANAL_MS * 3)
    expect(base.b.chamadas).toBe(3)
    conexoes[0].status('SUBSCRIBED')
    const depoisDeReconectar = base.b.chamadas
    r.avancar(CONFERENCIA_COM_CANAL_MS - 1)
    expect(base.b.chamadas).toBe(depoisDeReconectar)
    r.avancar(1)
    expect(base.b.chamadas).toBe(depoisDeReconectar + 1)
  })

  it('ao reconectar confere na hora (avisos perdidos)', () => {
    const { canal, conexoes } = montar()
    const base = baseFalsa()
    canal.ativar(base.s)
    conexoes[0].status('SUBSCRIBED')
    expect(base.b.chamadas).toBe(0)
    conexoes[0].status('TIMED_OUT')
    conexoes[0].status('SUBSCRIBED')
    expect(base.b.chamadas).toBe(1)
  })

  it('fecha 1 min depois da última base sair; voltar antes disso mantém a conexão', () => {
    const { canal, r, conexoes } = montar({ fecharDevolveClosed: true })
    const base = baseFalsa()
    canal.ativar(base.s)
    conexoes[0].status('SUBSCRIBED')
    canal.desativar(base.s)
    r.avancar(ESPERA_FECHAR_MS - 1)
    canal.ativar(base.s)
    r.avancar(ESPERA_FECHAR_MS * 2)
    expect(conexoes[0].fechada).toBe(0)
    canal.desativar(base.s)
    r.avancar(ESPERA_FECHAR_MS)
    expect(conexoes[0].fechada).toBe(1)
    expect(canal.status()).toBe('desligado')
    r.avancar(REABRIR_MS * 3)
    expect(conexoes).toHaveLength(1)
  })

  it('canal fechado sem ter sido pedido reabre sozinho', () => {
    const { canal, r, conexoes } = montar()
    canal.ativar(baseFalsa().s)
    conexoes[0].status('SUBSCRIBED')
    conexoes[0].status('CLOSED')
    expect(canal.status()).toBe('sem-canal')
    r.avancar(REABRIR_MS)
    expect(conexoes).toHaveLength(2)
    conexoes[1].status('SUBSCRIBED')
    expect(canal.status()).toBe('ao-vivo')
  })

  it('CLOSED que volta na hora dentro do fechar() não entra em laço e reabre uma vez só', () => {
    const { canal, r, conexoes } = montar({ fecharDevolveClosed: true })
    canal.ativar(baseFalsa().s)
    conexoes[0].status('SUBSCRIBED')
    conexoes[0].status('CLOSED')
    expect(conexoes[0].fechada).toBe(1)
    expect(r.pendentes()).toBe(2) // conferência de 30 s + uma reabertura
    r.avancar(REABRIR_MS)
    expect(conexoes).toHaveLength(2)
  })

  it('status de uma conexão antiga não mexe na nova', () => {
    const { canal, r, conexoes } = montar()
    canal.ativar(baseFalsa().s)
    conexoes[0].status('CLOSED')
    r.avancar(REABRIR_MS)
    conexoes[1].status('SUBSCRIBED')
    conexoes[0].status('CHANNEL_ERROR')
    expect(canal.status()).toBe('ao-vivo')
  })
})
