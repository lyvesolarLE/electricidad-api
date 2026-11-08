function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: requerida('DATABASE_URL'),
  // Opcionales: si faltan, el agente de WhatsApp queda desactivado y el resto del sistema funciona igual.
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
    // Nombres de las plantillas aprobadas en Meta, para avisar a clientes fuera de la ventana de 24 h.
    plantillas: {
      bienvenida: process.env.WHATSAPP_PLANTILLA_BIENVENIDA,
      recibo_pago: process.env.WHATSAPP_PLANTILLA_RECIBO_PAGO,
      servicio_completado: process.env.WHATSAPP_PLANTILLA_SERVICIO_COMPLETADO,
      idioma: process.env.WHATSAPP_PLANTILLA_IDIOMA ?? 'es',
    },
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
  },
};
