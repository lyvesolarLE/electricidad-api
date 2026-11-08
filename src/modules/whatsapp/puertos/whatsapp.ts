import type { MensajeHistorial, TurnoModelo } from '../dominio/agente.js';

export interface MensajeEntrante {
  id: string;
  telefono: string;
  texto: string;
  intentos: number;
}

export interface RepositorioMensajes {
  /** false si el mensaje ya se había recibido (Meta reintenta los webhooks). */
  encolarEntrante(m: { waId: string; telefono: string; texto: string }): Promise<boolean>;
  reclamarSiguiente(): Promise<MensajeEntrante | null>;
  recuperarAtascados(): Promise<void>;
  marcarRespondido(id: string): Promise<void>;
  reintentarOFallar(id: string, intentos: number, error: string, maxIntentos: number): Promise<void>;
  guardarSaliente(telefono: string, texto: string): Promise<void>;
  historial(telefono: string, limite: number): Promise<MensajeHistorial[]>;
}

export interface CanalMensajes {
  enviarTexto(telefono: string, texto: string): Promise<void>;
  /** Mensaje con plantilla aprobada por Meta; es la única forma de escribir primero a un cliente fuera de las 24 h. */
  enviarPlantilla(telefono: string, plantilla: string, idioma: string, parametros: string[]): Promise<void>;
}

export interface ModeloIA {
  responder(sistema: string, mensajes: TurnoModelo[]): Promise<string>;
}

export interface ContextoClientes {
  textoPara(telefono: string): Promise<string>;
}
