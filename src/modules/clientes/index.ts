import type { FastifyInstance } from 'fastify';
import { NotificadorPg } from '../notificaciones/adaptadores/notificador-pg.js';
import { RepositorioClientesPg } from './adaptadores/repositorio-clientes-pg.js';

interface CuerpoCliente {
  nombre: string;
  telefonoWhatsapp: string;
  email?: string;
  direccion?: string;
  vip?: boolean;
  /** Enviar mensaje de bienvenida por WhatsApp (por defecto, sí). */
  notificar?: boolean;
}

export async function clientesModule(app: FastifyInstance): Promise<void> {
  const repo = new RepositorioClientesPg();
  const notificador = new NotificadorPg(app.log);

  app.post<{ Body: CuerpoCliente }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['nombre', 'telefonoWhatsapp'],
          additionalProperties: false,
          properties: {
            nombre: { type: 'string', minLength: 1 },
            telefonoWhatsapp: { type: 'string', minLength: 5 },
            email: { type: 'string' },
            direccion: { type: 'string' },
            vip: { type: 'boolean' },
            notificar: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const cliente = await repo.crear({
        nombre: b.nombre,
        telefonoWhatsapp: b.telefonoWhatsapp,
        email: b.email ?? null,
        direccion: b.direccion ?? null,
        vip: b.vip ?? false,
      });
      if (b.notificar ?? true) await notificador.bienvenida(cliente.id);
      reply.status(201);
      return cliente;
    },
  );

  app.get('/', async () => repo.listar());

  app.get<{ Params: { id: string } }>(
    '/:id',
    { schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } },
    async (req, reply) => {
      const cliente = await repo.buscarPorId(req.params.id);
      if (!cliente) {
        reply.status(404);
        return { error: 'Cliente no encontrado' };
      }
      return cliente;
    },
  );
}
