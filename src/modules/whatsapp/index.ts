import type { FastifyInstance } from 'fastify';
import { config } from '../../shared/config.js';
import { ClaudeApi } from './adaptadores/claude-api.js';
import { ContextoClientesPg } from './adaptadores/contexto-pg.js';
import { RepositorioMensajesPg } from './adaptadores/mensajes-pg.js';
import { WhatsAppCloudApi } from './adaptadores/whatsapp-cloud-api.js';
import { firmaValida } from './dominio/firma.js';
import { extraerMensajes } from './dominio/mensajes.js';
import { procesarSiguiente } from './servicio/procesador.js';

interface CuerpoWebhook {
  raw: Buffer;
  json: unknown;
}

export async function whatsappModule(app: FastifyInstance): Promise<void> {
  const { verifyToken, appSecret, accessToken, phoneNumberId, apiVersion } = config.whatsapp;
  const { apiKey, model } = config.anthropic;

  if (!verifyToken || !appSecret || !accessToken || !phoneNumberId || !apiKey) {
    app.log.warn('Agente de WhatsApp desactivado: faltan variables de entorno (ver README)');
    return;
  }

  const mensajes = new RepositorioMensajesPg();
  const dependencias = {
    mensajes,
    modelo: new ClaudeApi(apiKey, model),
    canal: new WhatsAppCloudApi(accessToken, phoneNumberId, apiVersion),
    contexto: new ContextoClientesPg(),
    log: app.log,
  };

  // Conserva el cuerpo original: la firma de Meta se calcula sobre esos bytes exactos.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    try {
      const raw = body as Buffer;
      done(null, { raw, json: JSON.parse(raw.toString('utf8')) } satisfies CuerpoWebhook);
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  // Verificación inicial del webhook (Meta llama una vez al configurarlo).
  app.get('/webhook', { config: { publica: true, rateLimit: false } }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === verifyToken && q['hub.challenge']) {
      reply.type('text/plain');
      return q['hub.challenge'];
    }
    reply.status(403);
    return { error: 'Token de verificación inválido' };
  });

  // Recibe mensajes: valida la firma, los guarda en la cola y responde 200 de inmediato.
  app.post('/webhook', { config: { publica: true, rateLimit: false } }, async (req, reply) => {
    const cuerpo = req.body as CuerpoWebhook;
    if (!firmaValida(cuerpo.raw, req.headers['x-hub-signature-256'] as string | undefined, appSecret)) {
      reply.status(401);
      return { error: 'Firma inválida' };
    }
    for (const m of extraerMensajes(cuerpo.json)) await mensajes.encolarEntrante(m);
    return { ok: true };
  });

  // Worker en el mismo proceso: revisa la cola cada 2 segundos.
  let ocupado = false;
  const ciclo = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await mensajes.recuperarAtascados();
      for (let i = 0; i < 5; i++) {
        if (!(await procesarSiguiente(dependencias))) break;
      }
    } catch (error) {
      app.log.error({ err: error }, 'error en el worker de WhatsApp');
    } finally {
      ocupado = false;
    }
  };
  const temporizador = setInterval(ciclo, 2000);
  app.addHook('onClose', async () => clearInterval(temporizador));
}
