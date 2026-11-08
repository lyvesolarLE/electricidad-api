import { pool } from '../../../shared/db/pool.js';
import { bienvenida, reciboPago, servicioCompletado, type Contenido, type TipoNotificacion } from '../dominio/contenido.js';
import type { Notificador } from '../puertos/notificaciones.js';
import { RepositorioNotificacionesPg } from './notificaciones-pg.js';

interface Registrador {
  error: (obj: object, msg: string) => void;
  warn: (msg: string) => void;
}

/** Deja el aviso en la bandeja de salida. Si algo falla solo se registra: nunca debe romper un pago o un registro. */
export class NotificadorPg implements Notificador {
  private repo = new RepositorioNotificacionesPg();

  constructor(private log: Registrador) {}

  private async programar(
    tipo: TipoNotificacion,
    referencia: string,
    telefono: string,
    contenido: Contenido,
  ): Promise<void> {
    const digitos = telefono.replace(/\D/g, '');
    if (digitos.length < 8) {
      this.log.warn(`Aviso ${tipo} omitido: teléfono no válido (${referencia})`);
      return;
    }
    await this.repo.encolar({ referencia, telefono: digitos, tipo, contenido });
  }

  private async seguro(tarea: () => Promise<void>, descripcion: string): Promise<void> {
    try {
      await tarea();
    } catch (error) {
      this.log.error({ err: error }, `no se pudo programar el aviso: ${descripcion}`);
    }
  }

  bienvenida(clienteId: string): Promise<void> {
    return this.seguro(async () => {
      const r = await pool.query<{ nombre: string; telefono: string }>(
        'select nombre, telefono_whatsapp as telefono from clientes where id = $1',
        [clienteId],
      );
      const c = r.rows[0];
      if (c) await this.programar('bienvenida', `bienvenida:${clienteId}`, c.telefono, bienvenida(c.nombre));
    }, 'bienvenida');
  }

  reciboPago(pagoId: string): Promise<void> {
    return this.seguro(async () => {
      const r = await pool.query<{
        nombre: string;
        telefono: string;
        montoUsd: number;
        tipoServicio: string;
        saldoUsd: number;
      }>(
        `select c.nombre, c.telefono_whatsapp as telefono, p.monto_usd::float8 as "montoUsd", s.tipo as "tipoServicio",
                (s.monto_usd - coalesce((select sum(x.monto_usd) from pagos x
                                         where x.servicio_id = s.id and x.estado = 'confirmado'), 0))::float8 as "saldoUsd"
         from pagos p
         join servicios s on s.id = p.servicio_id
         join instalaciones i on i.id = s.instalacion_id
         join clientes c on c.id = i.cliente_id
         where p.id = $1`,
        [pagoId],
      );
      const d = r.rows[0];
      if (d) await this.programar('recibo_pago', `pago:${pagoId}`, d.telefono, reciboPago(d));
    }, 'recibo de pago');
  }

  servicioCompletado(servicioId: string): Promise<void> {
    return this.seguro(async () => {
      const r = await pool.query<{ nombre: string; telefono: string; tipoServicio: string }>(
        `select c.nombre, c.telefono_whatsapp as telefono, s.tipo as "tipoServicio"
         from servicios s
         join instalaciones i on i.id = s.instalacion_id
         join clientes c on c.id = i.cliente_id
         where s.id = $1`,
        [servicioId],
      );
      const d = r.rows[0];
      if (d) await this.programar('servicio_completado', `completado:${servicioId}`, d.telefono, servicioCompletado(d));
    }, 'servicio completado');
  }
}
