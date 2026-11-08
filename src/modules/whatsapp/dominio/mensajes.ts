export interface MensajeRecibido {
  waId: string;
  telefono: string;
  texto: string;
}

interface MensajeMeta {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
}

/** Extrae los mensajes de un webhook de WhatsApp Cloud API. Ignora estados de entrega y lo que no entienda. */
export function extraerMensajes(payload: unknown): MensajeRecibido[] {
  const resultado: MensajeRecibido[] = [];
  const entradas = (payload as { entry?: { changes?: { value?: { messages?: MensajeMeta[] } }[] }[] })?.entry ?? [];
  for (const entrada of entradas) {
    for (const cambio of entrada.changes ?? []) {
      for (const m of cambio.value?.messages ?? []) {
        if (!m.id || !m.from) continue;
        const texto =
          m.type === 'text' && m.text?.body
            ? m.text.body
            : '(El cliente envió un mensaje que no es texto: imagen, audio u otro archivo)';
        resultado.push({ waId: m.id, telefono: m.from, texto });
      }
    }
  }
  return resultado;
}
