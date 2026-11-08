import type { Contenido, TipoNotificacion } from '../dominio/contenido.js';

/** Lo que usan los demás módulos: pedir que se avise al cliente. Nunca debe romper la operación principal. */
export interface Notificador {
  bienvenida(clienteId: string): Promise<void>;
  reciboPago(pagoId: string): Promise<void>;
  servicioCompletado(servicioId: string): Promise<void>;
}

export interface Notificacion {
  id: string;
  telefono: string;
  tipo: TipoNotificacion;
  texto: string;
  parametros: string[];
  estado: 'pendiente' | 'procesando' | 'enviada' | 'error';
  intentos: number;
  ultimoError: string | null;
  creadaEn: string;
}

export interface NuevaNotificacion {
  referencia: string;
  telefono: string;
  tipo: TipoNotificacion;
  contenido: Contenido;
}

export interface RepositorioNotificaciones {
  /** false si ya existía una con esa referencia. */
  encolar(n: NuevaNotificacion): Promise<boolean>;
  reclamarSiguiente(): Promise<Notificacion | null>;
  recuperarAtascadas(): Promise<void>;
  marcarEnviada(id: string): Promise<void>;
  marcarError(id: string, error: string): Promise<void>;
  reintentarOFallar(id: string, intentos: number, error: string, maxIntentos: number): Promise<void>;
  /** ¿El cliente escribió en las últimas 24 h? Solo entonces se puede enviar texto libre. */
  tieneMensajeReciente(telefono: string): Promise<boolean>;
  listar(estado?: string): Promise<Notificacion[]>;
  reintentar(id: string): Promise<boolean>;
}
