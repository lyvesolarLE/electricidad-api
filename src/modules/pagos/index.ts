import type { FastifyInstance } from 'fastify';
import { errorDeNegocio } from '../../shared/errores.js';
import { NotificadorPg } from '../notificaciones/adaptadores/notificador-pg.js';
import { obtenerPasarela } from './adaptadores/pasarelas.js';
import { RepositorioPagosPg } from './adaptadores/repositorio-pagos-pg.js';
import { pendienteDePagar, validarSobrepago } from './dominio/pago.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const paramsId = { type: 'object', properties: { id: uuid } } as const;

export async function pagosModule(app: FastifyInstance): Promise<void> {
  const repo = new RepositorioPagosPg();
  const pasarela = obtenerPasarela();
  const notificador = new NotificadorPg(app.log);

  async function saldoDe(servicioId: string) {
    const saldo = await repo.saldo(servicioId);
    if (!saldo) throw errorDeNegocio('Servicio no encontrado', 404);
    return saldo;
  }

  // Registra un pago ya recibido (efectivo, transferencia verificada...): queda confirmado.
  app.post<{ Body: { servicioId: string; montoUsd: number; metodo: string; referencia?: string } }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['servicioId', 'montoUsd', 'metodo'],
          additionalProperties: false,
          properties: {
            servicioId: uuid,
            montoUsd: { type: 'number', exclusiveMinimum: 0 },
            metodo: { type: 'string', minLength: 1 },
            referencia: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      validarSobrepago(await saldoDe(b.servicioId), b.montoUsd);
      const pago = await repo.registrar({
        servicioId: b.servicioId,
        montoUsd: b.montoUsd,
        metodo: b.metodo,
        referencia: b.referencia ?? null,
        estado: 'confirmado',
        pasarela: 'manual',
        referenciaExterna: null,
      });
      await notificador.reciboPago(pago.id);
      reply.status(201);
      return pago;
    },
  );

  // Inicia un cobro con la pasarela configurada; queda pendiente hasta confirmarse.
  // Si no se indica monto, se cobra lo que falta del servicio.
  app.post<{ Body: { servicioId: string; montoUsd?: number; metodo?: string } }>(
    '/cobros',
    {
      schema: {
        body: {
          type: 'object',
          required: ['servicioId'],
          additionalProperties: false,
          properties: {
            servicioId: uuid,
            montoUsd: { type: 'number', exclusiveMinimum: 0 },
            metodo: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const saldo = await saldoDe(b.servicioId);
      const monto = b.montoUsd ?? pendienteDePagar(saldo);
      if (monto <= 0) throw errorDeNegocio('El servicio ya está pagado por completo');
      validarSobrepago(saldo, monto);

      const cobro = await pasarela.iniciarCobro({ servicioId: b.servicioId, montoUsd: monto });
      const pago = await repo.registrar({
        servicioId: b.servicioId,
        montoUsd: monto,
        metodo: b.metodo ?? pasarela.nombre,
        referencia: null,
        estado: 'pendiente',
        pasarela: pasarela.nombre,
        referenciaExterna: cobro.referenciaExterna,
      });
      reply.status(201);
      return { ...pago, urlPago: cobro.urlPago };
    },
  );

  app.post<{ Params: { id: string } }>('/:id/confirmar', { schema: { params: paramsId } }, async (req) => {
    const pago = await repo.obtener(req.params.id);
    if (!pago) throw errorDeNegocio('Pago no encontrado', 404);
    if (pago.estado !== 'pendiente') throw errorDeNegocio(`El pago ya está ${pago.estado}`, 409);
    validarSobrepago(await saldoDe(pago.servicioId), pago.montoUsd);
    const confirmado = await repo.cambiarEstado(pago.id, 'confirmado');
    await notificador.reciboPago(pago.id);
    return confirmado;
  });

  app.post<{ Params: { id: string } }>('/:id/rechazar', { schema: { params: paramsId } }, async (req) => {
    const pago = await repo.obtener(req.params.id);
    if (!pago) throw errorDeNegocio('Pago no encontrado', 404);
    if (pago.estado !== 'pendiente') throw errorDeNegocio(`El pago ya está ${pago.estado}`, 409);
    return repo.cambiarEstado(pago.id, 'rechazado');
  });

  app.get<{ Querystring: { servicioId: string } }>(
    '/',
    {
      schema: {
        querystring: { type: 'object', required: ['servicioId'], properties: { servicioId: uuid } },
      },
    },
    async (req) => repo.listarPorServicio(req.query.servicioId),
  );
}
