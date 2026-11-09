import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';

export type Rol = 'admin' | 'operador';

export interface ClaveApi {
  id: string;
  nombre: string;
  rol: Rol;
}

declare module 'fastify' {
  interface FastifyRequest {
    clave?: ClaveApi;
  }
  interface FastifyContextConfig {
    /** La ruta no exige clave (salud, webhook de Meta, que se valida con su propia firma). */
    publica?: boolean;
    /** Rol mínimo requerido. Sin esto basta con cualquier clave válida. */
    rol?: Rol;
  }
}

export function hashClave(clave: string): string {
  return createHash('sha256').update(clave).digest('hex');
}

/** 256 bits aleatorios: no se pueden adivinar, por eso basta un hash rápido para guardarlas. */
export function generarClave(): string {
  return `elk_${randomBytes(32).toString('base64url')}`;
}

/**
 * Seguro por defecto: toda ruta exige `Authorization: Bearer <clave>` salvo las marcadas con `config: { publica: true }`.
 * `buscar` devuelve la clave activa que corresponde a un hash, o null.
 */
export function registrarAutenticacion(
  app: FastifyInstance,
  buscar: (hash: string) => Promise<ClaveApi | null>,
): void {
    app.addHook('onRequest', async (req, reply) => {
    const config = req.routeOptions.config;
    if (config?.publica) return;
    
    // Excepción manual para el webhook de WhatsApp
    if (req.url.startsWith('/whatsapp/webhook')) return;

    const cabecera = req.headers.authorization;
    // ... el resto de tu código ...
    const clave = cabecera?.startsWith('Bearer ') ? cabecera.slice('Bearer '.length).trim() : '';
    if (!clave) return reply.status(401).send({ error: 'Falta la clave de API (Authorization: Bearer ...)' });

    const encontrada = await buscar(hashClave(clave));
    if (!encontrada) return reply.status(401).send({ error: 'Clave de API inválida' });
    if (config?.rol === 'admin' && encontrada.rol !== 'admin') {
      return reply.status(403).send({ error: 'Esta acción requiere una clave con rol admin' });
    }
    req.clave = encontrada;
  });
}
