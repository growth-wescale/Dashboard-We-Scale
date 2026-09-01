/**
 * Card de Ayrton Senna — aparece no rodapé da sidebar quando o Modo GP
 * está ativo. Portado do handoff (bloco `gp && (...)` no footer da
 * `<Sidebar>` em `_handoff_gp_mode/reference/index.html`).
 *
 * Visual:
 * - Raio 14px, overflow hidden
 * - Hairline vermelha 3px na esquerda
 * - Foto (senna-monaco.png) em aspect-ratio ≈ 1:1.04, object-fit cover
 * - Gradiente escuro do rodapé até 45% do card
 * - Tag "MÔNACO · 1993" em #FFD400 (dourado)
 * - Frase "Vencer é o que importa. O resto é consequência." — Ayrton Senna
 */

export function SennaCard() {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,.35)',
      }}
    >
      <img
        src="/assets/senna-monaco.png"
        alt="Ayrton Senna · McLaren em Mônaco"
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: '1 / 1.04',
          objectFit: 'cover',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(10,10,14,.85) 0%, transparent 45%)',
        }}
      />
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 10 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: '#FFD400',
          }}
        >
          Mônaco · 1993
        </div>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 500,
            color: 'rgba(255,255,255,.92)',
            lineHeight: 1.35,
            marginTop: 3,
          }}
        >
          "Vencer é o que importa. O resto é consequência." — Ayrton Senna
        </div>
      </div>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: '#E10600',
        }}
      />
    </div>
  )
}
