import { ExternalLink, FolderOpen, Info } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { SCard } from '@/components/ui/v2'
import {
  METABASE_BASES_COLECAO, RELATORIOS_METABASE, urlColecao, urlRelatorio,
  type RelatorioMetabase,
} from '@/constants/relatoriosMetabase'

function fmtData(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export function Relatorios() {
  return (
    <div style={{ padding: 'clamp(16px, 3vw, 32px)', maxWidth: 1200, margin: '0 auto' }}>
      <PageTop
        title="Relatórios"
        subtitle="Painéis do Metabase num lugar só. Cada link abre o Metabase numa aba nova."
      />

      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 20,
        borderRadius: 12, border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
        fontSize: 13, color: 'var(--ws-text-secondary)', lineHeight: 1.5,
      }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Precisa de login no Metabase. Os números vêm do banco do TI (oralunic_dw), que se atualiza
          por outro caminho, então podem não bater exatamente com as outras abas deste dashboard.
        </span>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(460px, 100%), 1fr))' }}>
        {RELATORIOS_METABASE.map(r => <CartaoRelatorio key={r.id} r={r} />)}
      </div>

      <a
        href={urlColecao(METABASE_BASES_COLECAO)}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 20,
          fontSize: 13, color: 'var(--ws-text-secondary)', textDecoration: 'none',
        }}
      >
        <FolderOpen size={15} />
        Bases para explorar e montar a sua própria pergunta no Metabase
        <ExternalLink size={13} />
      </a>
    </div>
  )
}

function CartaoRelatorio({ r }: { r: RelatorioMetabase }) {
  return (
    <SCard style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, color: 'var(--ws-text-primary)', lineHeight: 1.25 }}>
            {r.nome}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
            Alterado no Metabase em {fmtData(r.atualizadoEm)}
          </div>
        </div>
        <a
          href={urlRelatorio(r.id)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
            padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500,
            background: 'var(--brand-accent)', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          Abrir <ExternalLink size={14} />
        </a>
      </div>

      <p style={{ margin: 0, fontSize: 13, color: 'var(--ws-text-primary)', lineHeight: 1.5 }}>{r.descricao}</p>

      {r.aviso && (
        <div style={{ fontSize: 12, color: 'var(--status-atencao, #B7791F)' }}>{r.aviso}</div>
      )}

      {r.abas.length > 0 && (
        <div>
          <div style={rotulo}>Ir direto para a aba</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {r.abas.map(a => (
              <a
                key={a.id}
                href={urlRelatorio(r.id, a)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 12, whiteSpace: 'nowrap',
                  border: '1px solid var(--ws-border)', color: 'var(--ws-text-primary)', textDecoration: 'none',
                }}
              >
                {a.nome}
              </a>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        <span style={{ ...rotulo, display: 'inline', marginRight: 6 }}>Filtros</span>
        {r.filtros.join(' · ')}
      </div>
    </SCard>
  )
}

const rotulo: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--ws-text-secondary)', marginBottom: 6,
}
