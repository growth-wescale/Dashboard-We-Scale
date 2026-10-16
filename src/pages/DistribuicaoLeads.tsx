// Aba Distribuição de Leads (Vendas): painel por marca, log de atribuições, disponibilidade
// dos SDRs e saúde do fluxo. Só Administrador vê e edita (aba.distribuicao / acao.distribuicao-editar).
// Spec: docs/superpowers/specs/2026-10-16-distribuicao-leads-sdr-design.md
export function DistribuicaoLeads() {
  return (
    <div style={{ padding: '24px var(--page-pad-x, 24px)' }}>
      <h1 className="font-display" style={{ fontSize: 22, margin: 0 }}>Distribuição de Leads</h1>
    </div>
  )
}
