import type { FastifyInstance } from 'fastify';
import { NotificadorPg } from '../notificaciones/adaptadores/notificador-pg.js';
import { RepositorioInstalacionesPg } from './adaptadores/repositorio-instalaciones-pg.js';
import type { EstadoConformidad, EstadoServicio, TipoServicio } from './dominio/instalacion.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const tiposServicio = ['asesoria', 'mantenimiento', 'mano_de_obra', 'monitoreo', 'atencion_vip'];

export async function instalacionesModule(app: FastifyInstance): Promise<void> {
  const repo = new RepositorioInstalacionesPg();
  const notificador = new NotificadorPg(app.log);

  // ---- Catálogo de equipos (precio de referencia / valor de mercado) ----
  app.post<{
    Body: { marca: string; modelo: string; tipo: string; potenciaW?: number; precioReferenciaUsd: number };
  }>(
    '/catalogo-equipos',
    {
      schema: {
        body: {
          type: 'object',
          required: ['marca', 'modelo', 'tipo', 'precioReferenciaUsd'],
          additionalProperties: false,
          properties: {
            marca: { type: 'string', minLength: 1 },
            modelo: { type: 'string', minLength: 1 },
            tipo: { type: 'string', minLength: 1 },
            potenciaW: { type: 'integer', minimum: 0 },
            precioReferenciaUsd: { type: 'number', minimum: 0 },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const equipo = await repo.crearEquipoCatalogo({
        marca: b.marca,
        modelo: b.modelo,
        tipo: b.tipo,
        potenciaW: b.potenciaW ?? null,
        precioReferenciaUsd: b.precioReferenciaUsd,
      });
      reply.status(201);
      return equipo;
    },
  );

  app.get('/catalogo-equipos', async () => repo.listarCatalogo());

  // ---- Instalaciones ----
  app.post<{
    Body: {
      clienteId: string;
      direccion?: string;
      instaladaPorEmpresa?: boolean;
      fechaInstalacion?: string;
      equipos: { catalogoEquipoId: string; cantidad: number; precioUnitarioUsd?: number }[];
    };
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['clienteId', 'equipos'],
          additionalProperties: false,
          properties: {
            clienteId: uuid,
            direccion: { type: 'string' },
            instaladaPorEmpresa: { type: 'boolean' },
            fechaInstalacion: { type: 'string', format: 'date' },
            equipos: {
              type: 'array',
              items: {
                type: 'object',
                required: ['catalogoEquipoId', 'cantidad'],
                additionalProperties: false,
                properties: {
                  catalogoEquipoId: uuid,
                  cantidad: { type: 'integer', minimum: 1 },
                  precioUnitarioUsd: { type: 'number', minimum: 0 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const instalacion = await repo.crearInstalacion({
        clienteId: b.clienteId,
        direccion: b.direccion ?? null,
        instaladaPorEmpresa: b.instaladaPorEmpresa ?? true,
        fechaInstalacion: b.fechaInstalacion ?? null,
        equipos: b.equipos.map((e) => ({
          catalogoEquipoId: e.catalogoEquipoId,
          cantidad: e.cantidad,
          precioUnitarioUsd: e.precioUnitarioUsd ?? null,
        })),
      });
      reply.status(201);
      return instalacion;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/:id',
    { schema: { params: { type: 'object', properties: { id: uuid } } } },
    async (req, reply) => {
      const instalacion = await repo.obtenerInstalacion(req.params.id);
      if (!instalacion) {
        reply.status(404);
        return { error: 'Instalación no encontrada' };
      }
      return instalacion;
    },
  );

  // ---- Servicios de una instalación (el monto automático llega en el paso de cotizaciones) ----
  app.post<{ Params: { id: string }; Body: { tipo: TipoServicio; montoUsd: number; vip?: boolean } }>(
    '/:id/servicios',
    {
      schema: {
        params: { type: 'object', properties: { id: uuid } },
        body: {
          type: 'object',
          required: ['tipo', 'montoUsd'],
          additionalProperties: false,
          properties: {
            tipo: { type: 'string', enum: tiposServicio },
            montoUsd: { type: 'number', minimum: 0 },
            vip: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const servicio = await repo.crearServicio({
        instalacionId: req.params.id,
        tipo: req.body.tipo,
        montoUsd: req.body.montoUsd,
        vip: req.body.vip ?? false,
      });
      reply.status(201);
      return servicio;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/:id/servicios',
    { schema: { params: { type: 'object', properties: { id: uuid } } } },
    async (req) => repo.listarServicios(req.params.id),
  );

  // ---- Estado del servicio. Al pasar a "completado" se avisa al cliente por WhatsApp ----
  app.put<{ Params: { servicioId: string }; Body: { estado: EstadoServicio; notificar?: boolean } }>(
    '/servicios/:servicioId/estado',
    {
      schema: {
        params: { type: 'object', properties: { servicioId: uuid } },
        body: {
          type: 'object',
          required: ['estado'],
          additionalProperties: false,
          properties: {
            estado: { type: 'string', enum: ['cotizado', 'aceptado', 'en_curso', 'completado', 'cancelado'] },
            notificar: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const servicio = await repo.cambiarEstadoServicio(req.params.servicioId, req.body.estado);
      if (!servicio) {
        reply.status(404);
        return { error: 'Servicio no encontrado' };
      }
      if (req.body.estado === 'completado' && (req.body.notificar ?? true)) {
        await notificador.servicioCompletado(servicio.id);
      }
      return servicio;
    },
  );

  // ---- Conformidad del cliente ----
  app.put<{
    Params: { servicioId: string };
    Body: { estado: EstadoConformidad; comentario?: string };
  }>(
    '/servicios/:servicioId/conformidad',
    {
      schema: {
        params: { type: 'object', properties: { servicioId: uuid } },
        body: {
          type: 'object',
          required: ['estado'],
          additionalProperties: false,
          properties: {
            estado: { type: 'string', enum: ['pendiente', 'conforme', 'no_conforme'] },
            comentario: { type: 'string' },
          },
        },
      },
    },
    async (req) =>
      repo.registrarConformidad({
        servicioId: req.params.servicioId,
        estado: req.body.estado,
        comentario: req.body.comentario ?? null,
      }),
  );
}
