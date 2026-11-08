import type { FastifyInstance } from 'fastify';
import { config } from '../../shared/config.js';
import { RepositorioMensajesPg } from '../whatsapp/adaptadores/mensajes-pg.js';
import { WhatsAppCloudApi } from '../whatsapp/adaptadores/whatsapp-cloud-api.js';
import { RepositorioNotificacionesPg } from './adaptadores/notificaciones-pg.js';
import { enviarSiguiente } from './servicio/enviador.js';

export async function notificacionesModule(app: FastifyInstance): Promise<void> {
  const repo = new RepositorioNotificacionesPg();

  // Bandeja de salida: permite ver qué se envió y qué falló, y reintentar.
  app.get<{ Querystring: { estado?: string } }>(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { estado: { type: 'string', enum: ['pendiente', 'procesando', 'enviada', 'error'] } },
        },
      },
    },
    async (req) => repo.listar(req.query.estado),
  );

  app.post<{ Params: { id: string } }>(
    '/:id/reintentar',
    { schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } },
    async (req, reply) => {
      if (!(await repo.reintentar(req.params.id))) {
        reply.status(404);
        return { error: 'No hay una notificación en error con ese id' };
      }
      return { ok: true };
    },
  );

  const { accessToken, phoneNumberId, apiVersion, plantillas } = config.whatsapp;
  if (!accessToken || !phoneNumberId) {
    app.log.warn('Envío de avisos desactivado: faltan credenciales de WhatsApp (los avisos quedan en la bandeja)');
    return;
  }

  const dependencias = {
    repo,
    canal: new WhatsAppCloudApi(accessToken, phoneNumberId, apiVersion),
    historial: new RepositorioMensajesPg(),
    plantillas: { ...plantillas },
    idioma: plantillas.idioma,
    log: app.log,
  };

  let ocupado = false;
  const ciclo = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await repo.recuperarAtascadas();
      for (let i = 0; i < 10; i++) {
        if (!(await enviarSiguiente(dependencias))) break;
      }
    } catch (error) {
      app.log.error({ err: error }, 'error en el envío de avisos');
    } finally {
      ocupado = false;
    }
  };
  const temporizador = setInterval(ciclo, 3000);
  app.addHook('onClose', async () => clearInterval(temporizador));
}
