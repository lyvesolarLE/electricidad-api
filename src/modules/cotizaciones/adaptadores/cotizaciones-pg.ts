import { pool } from '../../../shared/db/pool.js';
import { RepositorioClientesPg } from '../../clientes/adaptadores/repositorio-clientes-pg.js';
import { RepositorioInstalacionesPg } from '../../instalaciones/adaptadores/repositorio-instalaciones-pg.js';
import type { Servicio } from '../../instalaciones/dominio/instalacion.js';
import type { Concepto, LineaCotizacion, Tarifa } from '../dominio/cotizacion.js';
import type {
  ContextoCotizacion,
  OrigenContexto,
  RegistroServicios,
  RepositorioTarifas,
} from '../puertos/cotizaciones.js';

export class RepositorioTarifasPg implements RepositorioTarifas {
  async listar(): Promise<Tarifa[]> {
    const r = await pool.query<Tarifa>('select concepto, tipo, valor::float8 as valor from tarifas order by concepto');
    return r.rows;
  }

  async actualizar(concepto: Concepto, valor: number): Promise<Tarifa | null> {
    const r = await pool.query<Tarifa>(
      `update tarifas set valor = $2, actualizado_en = now() where concepto = $1
       returning concepto, tipo, valor::float8 as valor`,
      [concepto, valor],
    );
    return r.rows[0] ?? null;
  }
}

export class OrigenContextoPg implements OrigenContexto {
  private instalaciones = new RepositorioInstalacionesPg();
  private clientes = new RepositorioClientesPg();

  async obtener(instalacionId: string): Promise<ContextoCotizacion | null> {
    const instalacion = await this.instalaciones.obtenerInstalacion(instalacionId);
    if (!instalacion) return null;
    const cliente = await this.clientes.buscarPorId(instalacion.clienteId);
    return { valorEquiposUsd: instalacion.valorEquiposUsd, clienteVip: cliente?.vip ?? false };
  }
}

export class RegistroServiciosPg implements RegistroServicios {
  private instalaciones = new RepositorioInstalacionesPg();

  async crear(instalacionId: string, lineas: LineaCotizacion[], vip: boolean): Promise<Servicio[]> {
    const client = await pool.connect();
    const ids: string[] = [];
    try {
      await client.query('begin');
      for (const l of lineas) {
        const r = await client.query<{ id: string }>(
          `insert into servicios (instalacion_id, tipo, monto_usd, vip) values ($1, $2, $3, $4) returning id`,
          [instalacionId, l.concepto, l.montoUsd, vip],
        );
        ids.push(r.rows[0].id);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    const todos = await this.instalaciones.listarServicios(instalacionId);
    return todos.filter((s) => ids.includes(s.id));
  }
}
