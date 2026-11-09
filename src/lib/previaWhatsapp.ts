const local = import.meta.env.VITE_PREVIA_WHATSAPP === 'true' &&
  ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname)
export const whatsappAtivo = local || import.meta.env.VITE_WHATSAPP_OURO_ENABLED === 'true'
export const whatsappResumo = local ? '/api/previa-whatsapp/v1/resumo' : '/api/whatsapp-ouro/v1/resumo'
