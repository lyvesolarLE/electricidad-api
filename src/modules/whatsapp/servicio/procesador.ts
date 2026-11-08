import { construirSistema, normalizarHistorial } from '../dominio/agente.js';
import type { CanalMensajes, ContextoClientes, ModeloIA, RepositorioMensajes } from '../puertos/whatsapp.js';

export interface DependenciasProcesador {
  mensajes: RepositorioMensajes;
  modelo: ModeloIA;
  canal: CanalMensajes;
  contexto: ContextoClientes;
  log: { error: (obj: object, msg: string) => void };
}

export const MAX_INTENTOS = 3;

/** Toma el siguiente mensaje de la cola, genera la respuesta con IA y la envía. false si no había nada. */
export async function procesarSiguiente(d: DependenciasProcesador): Promise<boolean> {
  const mensaje = await d.mensajes.reclamarSiguiente();
  if (!mensaje) return false;

  try {
    const [contexto, historial] = await Promise.all([
      d.contexto.textoPara(mensaje.telefono),
      d.mensajes.historial(mensaje.telefono, 12),
    ]);
    const respuesta = await d.modelo.responder(construirSistema(contexto), normalizarHistorial(historial));
    await d.canal.enviarTexto(mensaje.telefono, respuesta);
    await d.mensajes.guardarSaliente(mensaje.telefono, respuesta);
    await d.mensajes.marcarRespondido(mensaje.id);
  } catch (error) {
    const texto = error instanceof Error ? error.message : String(error);
    d.log.error({ err: error, mensajeId: mensaje.id, intentos: mensaje.intentos }, 'fallo al responder por WhatsApp');
    await d.mensajes.reintentarOFallar(mensaje.id, mensaje.intentos, texto, MAX_INTENTOS);
  }
  return true;
}
