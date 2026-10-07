import { useEffect, useRef } from 'react'

/** Controle local: não altera o modo Octógono do menu nem de outras páginas. */
export function OctagonOverviewVisibility({ hidden, onChange }: { hidden: boolean; onChange: (hidden: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const informed = useRef(false)
  useEffect(() => {
    if (!hidden && !informed.current) {
      informed.current = true
      dialog.current?.showModal()
    }
  }, [hidden])
  const close = () => dialog.current?.close()
  return <>
    {hidden && <div style={{ padding: '12px 24px' }}><button type="button" onClick={() => onChange(false)}>Mostrar tema</button></div>}
    <dialog ref={dialog} aria-labelledby="oct-overview-info" style={{ maxWidth: 420, padding: 24, border: '1px solid var(--ws-border)', borderRadius: 12, background: 'var(--ws-surface)', color: 'var(--ws-text-primary)' }}>
      <h2 id="oct-overview-info">Mais espaço para os indicadores</h2>
      <p>Você pode ocultar os blocos do Octógono nesta Visão Geral para ocupar menos espaço. O menu e as outras páginas não mudam. Para voltar, use Mostrar tema.</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button" autoFocus onClick={() => { onChange(true); close() }}>Ocultar tema</button>
        <button type="button" onClick={close}>Manter tema</button>
      </div>
    </dialog>
  </>
}
