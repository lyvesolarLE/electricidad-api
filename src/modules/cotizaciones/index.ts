import type { FastifyInstance } from 'fastify';
import { OrigenContextoPg, RegistroServiciosPg, RepositorioTarifasPg } from './adaptadores/cotizaciones-pg.js';
import { CONCEPTOS_BASE, calcularCotizacion, type Concepto } from './dominio/cotizacion.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const conceptos = ['asesoria', 'mantenimiento', 'mano_de_obra', 'monitoreo', 'atencion_vip'];

export async function cotizacionesModule(app: FastifyInstance): Promise<void> {
  const tarifas = new RepositorioTarifasPg();
  const origen = new OrigenContextoPg();
  const registro = new RegistroServiciosPg();

  app.get('/tarifas', async () => tarifas.listar());

  app.put<{ Params: { concepto: Concepto }; Body: { valor: number } }>(
    '/tarifas/:concepto',
    {
      config: { rol: 'admin' },
      schema: {
        params: { type: 'object', properties: { concepto: { type: 'string', enum: conceptos } } },
        body: {
          type: 'object',
          required: ['valor'],
          additionalProperties: false,
          properties: { valor: { type: 'number', minimum: 0 } },
        },
      },
    },
    async (req, reply) => {
      const tarifa = await tarifas.actualizar(req.params.concepto, req.body.valor);
      if (!tarifa) {
        reply.status(404);
        return { error: 'Tarifa no encontrada' };
      }
      return tarifa;
    },
  );

  // Calcula la cotización de una instalación. Con crearServicios=true, además registra los servicios.
  app.post<{
    Body: { instalacionId: string; conceptos?: Concepto[]; vip?: boolean; crearServicios?: boolean };
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['instalacionId'],
          additionalProperties: false,
          properties: {
            instalacionId: uuid,
            conceptos: { type: 'array', minItems: 1, items: { type: 'string', enum: conceptos } },
            vip: { type: 'boolean' },
            crearServicios: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const contexto = await origen.obtener(b.instalacionId);
      if (!contexto) {
        reply.status(404);
        return { error: 'Instalación no encontrada' };
      }

      const vip = b.vip ?? contexto.clienteVip;
      const cotizacion = calcularCotizacion({
        instalacionId: b.instalacionId,
        valorEquiposUsd: contexto.valorEquiposUsd,
        tarifas: await tarifas.listar(),
        conceptos: b.conceptos ?? CONCEPTOS_BASE,
        vip,
      });

      if (!b.crearServicios) return cotizacion;

      const servicios = await registro.crear(b.instalacionId, cotizacion.lineas, vip);
      reply.status(201);
      return { ...cotizacion, servicios };
    },
  );
}
