import { defineConfig } from 'vitest/config'
import path from 'path'

// Testes cobrem só lógica pura (camada de métricas e normalização de fonte).
// Nada de rede, nada de componente — por isso não há setup de DOM aqui.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    // As Edge Functions (Deno) usam só APIs web (fetch, AbortSignal); os módulos puros delas
    // rodam no Node e são testados aqui também.
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    // Contagens dependem de fuso: fixa Brasília para o resultado não variar
    // com a máquina que roda os testes (CI em UTC vs. laptop em BRT).
    env: { TZ: 'America/Sao_Paulo' },
  },
})
