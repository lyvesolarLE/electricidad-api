import type { FastifyInstance } from 'fastify';
import { generarClave, hashClave, type Rol } from './autenticacion.js';
import { RepositorioClavesPg } from './claves-pg.js';

export async function clavesModule(app: FastifyInstance): Promise<void> {
  const repo = new RepositorioClavesPg();

  // La clave completa se devuelve solo aquí, una vez. No se puede volver a consultar.
  app.post<{ Body: { nombre: string; rol: Rol } }>(
    '/',
    {
      config: { rol: 'admin' },
      schema: {
        body: {
          type: 'object',
          required: ['nombre', 'rol'],
          additionalProperties: false,
          properties: {
            nombre: { type: 'string', minLength: 1 },
            rol: { type: 'string', enum: ['admin', 'operador'] },
          },
        },
      },
    },
    async (req, reply) => {
      const clave = generarClave();
      const id = await repo.crear(req.body.nombre, req.body.rol, hashClave(clave));
      reply.status(201);
      return { id, nombre: req.body.nombre, rol: req.body.rol, clave };
    },
  );

  app.get('/', { config: { rol: 'admin' } }, async () => repo.listar());

  app.delete<{ Params: { id: string } }>(
    '/:id',
    {
      config: { rol: 'admin' },
      schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
    },
    async (req, reply) => {
      const resultado = await repo.revocar(req.params.id);
      if (resultado === 'no_existe') {
        reply.status(404);
        return { error: 'Clave no encontrada' };
      }
      if (resultado === 'ultimo_admin') {
        reply.status(409);
        return { error: 'No se puede revocar la única clave de administrador activa' };
      }
      return { ok: true };
    },
  );
}
