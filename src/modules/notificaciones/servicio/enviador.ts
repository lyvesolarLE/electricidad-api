import type { CanalMensajes, RepositorioMensajes } from '../../whatsapp/puertos/whatsapp.js';
import type { Notificacion, RepositorioNotificaciones } from '../puertos/notificaciones.js';

export const MAX_INTENTOS = 3;

export interface DependenciasEnviador {
  repo: RepositorioNotificaciones;
  canal: CanalMensajes;
  historial: Pick<RepositorioMensajes, 'guardarSaliente'>;
  plantillas: Partial<Record<string, string | undefined>>;
  idioma: string;
  log: { error: (obj: object, msg: string) => void };
}

class SinPlantilla extends Error {}

async function enviar(d: DependenciasEnviador, n: Notificacion): Promise<void> {
  if (await d.repo.tieneMensajeReciente(n.telefono)) {
    await d.canal.enviarTexto(n.telefono, n.texto);
    return;
  }
  // Fuera de la ventana de 24 h, WhatsApp solo permite plantillas aprobadas.
  const plantilla = d.plantillas[n.tipo];
  if (!plantilla) {
    throw new SinPlantilla(`El cliente no ha escrito en 24 h y no hay plantilla configurada para "${n.tipo}"`);
  }
  await d.canal.enviarPlantilla(n.telefono, plantilla, d.idioma, n.parametros);
}

/** Toma el siguiente aviso de la bandeja y lo envía. false si no había ninguno. */
export async function enviarSiguiente(d: DependenciasEnviador): Promise<boolean> {
  const n = await d.repo.reclamarSiguiente();
  if (!n) return false;

  try {
    await enviar(d, n);
    // Se guarda en el historial para que el agente tenga contexto cuando el cliente responda.
    await d.historial.guardarSaliente(n.telefono, n.texto);
    await d.repo.marcarEnviada(n.id);
  } catch (error) {
    const texto = error instanceof Error ? error.message : String(error);
    d.log.error({ err: error, notificacionId: n.id }, 'fallo al enviar la notificación');
    if (error instanceof SinPlantilla) await d.repo.marcarError(n.id, texto);
    else await d.repo.reintentarOFallar(n.id, n.intentos, texto, MAX_INTENTOS);
  }
  return true;
}
