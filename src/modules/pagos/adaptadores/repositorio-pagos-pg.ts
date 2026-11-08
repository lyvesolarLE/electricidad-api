import { pool } from '../../../shared/db/pool.js';
import type { EstadoPago, NuevoPago, Pago, SaldoServicio } from '../dominio/pago.js';
import type { RepositorioPagos } from '../puertos/repositorio-pagos.js';

const columnas = `id, servicio_id as "servicioId", monto_usd::float8 as "montoUsd", metodo, referencia,
  estado, pasarela, referencia_externa as "referenciaExterna", pagado_en as "pagadoEn"`;

export class RepositorioPagosPg implements RepositorioPagos {
  async registrar(p: NuevoPago): Promise<Pago> {
    const r = await pool.query<Pago>(
      `insert into pagos (servicio_id, monto_usd, metodo, referencia, estado, pasarela, referencia_externa)
       values ($1, $2, $3, $4, $5, $6, $7) returning ${columnas}`,
      [p.servicioId, p.montoUsd, p.metodo, p.referencia, p.estado, p.pasarela, p.referenciaExterna],
    );
    return r.rows[0];
  }

  async obtener(id: string): Promise<Pago | null> {
    const r = await pool.query<Pago>(`select ${columnas} from pagos where id = $1`, [id]);
    return r.rows[0] ?? null;
  }

  async cambiarEstado(id: string, estado: EstadoPago): Promise<Pago | null> {
    const r = await pool.query<Pago>(`update pagos set estado = $2 where id = $1 returning ${columnas}`, [id, estado]);
    return r.rows[0] ?? null;
  }

  async listarPorServicio(servicioId: string): Promise<Pago[]> {
    const r = await pool.query<Pago>(`select ${columnas} from pagos where servicio_id = $1 order by pagado_en`, [
      servicioId,
    ]);
    return r.rows;
  }

  async saldo(servicioId: string): Promise<SaldoServicio | null> {
    const r = await pool.query<SaldoServicio>(
      `select s.monto_usd::float8 as "montoUsd",
              coalesce((select sum(p.monto_usd) from pagos p where p.servicio_id = s.id and p.estado = 'confirmado'), 0)::float8 as "pagadoUsd"
       from servicios s where s.id = $1`,
      [servicioId],
    );
    return r.rows[0] ?? null;
  }
}
