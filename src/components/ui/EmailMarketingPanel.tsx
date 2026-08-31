import { Send, MailCheck, MailOpen, MousePointerClick, MailWarning, MailX, Handshake } from 'lucide-react'

interface Props {
  marca: string
  dataInicio?: string
  dataFim?: string
}

export function EmailMarketingPanel({ marca: _marca, dataInicio: _dataInicio, dataFim: _dataFim }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--status-atencao-bg, #fef7e6)', border: '1px solid var(--status-atencao, #F2A93B)', fontSize: 13, lineHeight: 1.5 }}>
        <b>Integração em construção.</b> Esta página vai receber dados diretos do RD Station Marketing — envios, entregas, aberturas, cliques, bounces e descartados. Todo clique em link dentro do e-mail cria automaticamente uma negociação no funil <b>Prospecção Ativa</b> (posteriormente migrada para funil de <b>Recuperação</b>), identificada por UTM e tag de marketing.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <KpiCard icon={<Send size={16} />} label="Enviados" value="—" sub="Total disparado no período" />
        <KpiCard icon={<MailCheck size={16} />} label="Entregues" value="—" sub="Taxa de entrega —" />
        <KpiCard icon={<MailOpen size={16} />} label="Taxa de abertura" value="—" sub="Aberturas únicas / entregues" />
        <KpiCard icon={<MousePointerClick size={16} />} label="Taxa de cliques" value="—" sub="CTR sobre entregues" />
        <KpiCard icon={<MailWarning size={16} />} label="Bounces" value="—" sub="Hard + soft" />
        <KpiCard icon={<MailX size={16} />} label="Descartados" value="—" sub="Descadastros + marcados como spam" />
        <KpiCard icon={<Handshake size={16} />} label="Negociações geradas" value="—" sub="Cliques → Prospecção Ativa" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Block title="Últimos envios" subtitle="Campanhas disparadas no período">
          <EmptyPlaceholder text="Aguardando integração com RD Station Marketing" />
        </Block>
        <Block title="Top links clicados" subtitle="Ordenado por cliques únicos">
          <EmptyPlaceholder text="Aguardando integração com RD Station Marketing" />
        </Block>
      </div>

      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-primary)', marginBottom: 8 }}>Roadmap desta página</div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: 'var(--ws-text-secondary)', lineHeight: 1.7 }}>
          <li>Integração com API RD Station Marketing (envios, aberturas, cliques, bounces, descartados)</li>
          <li>Ingestão diária via Edge Function do Supabase</li>
          <li>Automação: clique em link no e-mail → cria negociação no funil Prospecção Ativa com tag <code>email_marketing</code></li>
          <li>Migração futura das negociações para funil dedicado de Recuperação</li>
          <li>Segregação de leads Oral Unic vindos da conta V4 Company via UTMs específicas</li>
        </ul>
      </div>
    </div>
  )
}

interface KpiCardProps { icon: React.ReactNode; label: string; value: string; sub?: string }
function KpiCard({ icon, label, value, sub }: KpiCardProps) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ws-text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

interface BlockProps { title: string; subtitle?: string; children: React.ReactNode }
function Block({ title, subtitle, children }: BlockProps) {
  return (
    <div style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ws-border)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-text-primary)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function EmptyPlaceholder({ text }: { text: string }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--ws-text-secondary)' }}>
      {text}
    </div>
  )
}
