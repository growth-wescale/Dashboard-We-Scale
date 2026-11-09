export const previaWhatsapp = import.meta.env.VITE_PREVIA_WHATSAPP === 'true' &&
  ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname)
