import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { registrarAutenticacion } from './modules/claves/autenticacion.js';
import { RepositorioClavesPg } from './modules/claves/claves-pg.js';
import { clavesModule } from './modules/claves/index.js';
import { pool } from './shared/db/pool.js';
import { clientesModule } from './modules/clientes/index.js';
import { instalacionesModule } from './modules/instalaciones/index.js';
import { cotizacionesModule } from './modules/cotizaciones/index.js';
import { pagosModule } from './modules/pagos/index.js';
import { whatsappModule } from './modules/whatsapp/index.js';
import { notificacionesModule } from './modules/notificaciones/index.js';

export function buildApp() {
  // El logger de Fastify ya registra método, ruta, código y tiempo de respuesta de cada petición.
  // trustProxy: detrás de Railway, la IP real del cliente viene en las cabeceras del proxy.
  const app = Fastify({ logger: true, trustProxy: true });

  // Límite general por IP (el webhook de Meta queda fuera) y autenticación obligatoria por defecto.
  app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  const claves = new RepositorioClavesPg();
  registrarAutenticacion(app, (hash) => claves.buscarPorHash(hash));

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'error no controlado');
    const codigo = (error as { code?: string }).code;
    if (codigo === '23505') return reply.status(409).send({ error: 'Ya existe un registro con esos datos' });
    if (codigo === '23503') return reply.status(400).send({ error: 'Referencia a un registro que no existe' });
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    reply.status(status).send({ error: status >= 500 ? 'Error interno' : (error as Error).message });
  });

  app.get('/health', { config: { publica: true } }, async () => ({ status: 'ok' }));

  app.get('/health/db', async (_request, reply) => {
    try {
      await pool.query('select 1');
      return {
        status: 'ok',
        pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      };
    } catch {
      reply.status(503);
      return { status: 'error' };
    }
  });

  app.register(clavesModule, { prefix: '/claves' });
  app.register(clientesModule, { prefix: '/clientes' });
  app.register(instalacionesModule, { prefix: '/instalaciones' });
  app.register(cotizacionesModule, { prefix: '/cotizaciones' });
  app.register(pagosModule, { prefix: '/pagos' });
  app.register(whatsappModule, { prefix: '/whatsapp', config: { publica: true } });
  app.register(notificacionesModule, { prefix: '/notificaciones' });

  return app;
}
