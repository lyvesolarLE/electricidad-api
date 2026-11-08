import { pool } from '../../../shared/db/pool.js';
import type {
  Conformidad,
  EstadoServicio,
  EquipoCatalogo,
  EquipoInstalado,
  Instalacion,
  NuevaInstalacion,
  NuevoEquipoCatalogo,
  NuevoServicio,
  Servicio,
} from '../dominio/instalacion.js';
import type { RepositorioInstalaciones } from '../puertos/repositorio-instalaciones.js';

const columnasCatalogo = `id, marca, modelo, tipo, potencia_w as "potenciaW", precio_referencia_usd::float8 as "precioReferenciaUsd"`;

const consultaServicios = `
  select s.id, s.instalacion_id as "instalacionId", s.tipo, s.monto_usd::float8 as "montoUsd",
         s.vip, s.estado,
         coalesce((select sum(p.monto_usd) from pagos p where p.servicio_id = s.id and p.estado = 'confirmado'), 0)::float8 as "pagadoUsd",
         c.estado as conformidad
  from servicios s
  left join conformidades c on c.servicio_id = s.id`;

export class RepositorioInstalacionesPg implements RepositorioInstalaciones {
  async crearEquipoCatalogo(e: NuevoEquipoCatalogo): Promise<EquipoCatalogo> {
    const r = await pool.query<EquipoCatalogo>(
      `insert into catalogo_equipos (marca, modelo, tipo, potencia_w, precio_referencia_usd)
       values ($1, $2, $3, $4, $5) returning ${columnasCatalogo}`,
      [e.marca, e.modelo, e.tipo, e.potenciaW, e.precioReferenciaUsd],
    );
    return r.rows[0];
  }

  async listarCatalogo(): Promise<EquipoCatalogo[]> {
    const r = await pool.query<EquipoCatalogo>(
      `select ${columnasCatalogo} from catalogo_equipos order by marca, modelo`,
    );
    return r.rows;
  }

  async crearInstalacion(d: NuevaInstalacion): Promise<Instalacion> {
    const client = await pool.connect();
    let id: string;
    try {
      await client.query('begin');
      const r = await client.query<{ id: string }>(
        `insert into instalaciones (cliente_id, direccion, instalada_por_empresa, fecha_instalacion)
         values ($1, $2, $3, $4) returning id`,
        [d.clienteId, d.direccion, d.instaladaPorEmpresa, d.fechaInstalacion],
      );
      id = r.rows[0].id;
      for (const e of d.equipos) {
        await client.query(
          `insert into instalacion_equipos (instalacion_id, catalogo_equipo_id, cantidad, precio_unitario_usd)
           values ($1, $2, $3, $4)`,
          [id, e.catalogoEquipoId, e.cantidad, e.precioUnitarioUsd],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    return (await this.obtenerInstalacion(id))!;
  }

  async obtenerInstalacion(id: string): Promise<Instalacion | null> {
    const r = await pool.query<Omit<Instalacion, 'equipos' | 'valorEquiposUsd'>>(
      `select id, cliente_id as "clienteId", direccion, instalada_por_empresa as "instaladaPorEmpresa",
              to_char(fecha_instalacion, 'YYYY-MM-DD') as "fechaInstalacion"
       from instalaciones where id = $1`,
      [id],
    );
    if (!r.rows[0]) return null;

    const equipos = await pool.query<EquipoInstalado>(
      `select catalogo_equipo_id as "catalogoEquipoId", cantidad, precio_unitario_usd::float8 as "precioUnitarioUsd"
       from instalacion_equipos where instalacion_id = $1`,
      [id],
    );
    const valor = await pool.query<{ valor: number }>(
      `select coalesce(sum(ie.cantidad * coalesce(ie.precio_unitario_usd, ce.precio_referencia_usd)), 0)::float8 as valor
       from instalacion_equipos ie
       join catalogo_equipos ce on ce.id = ie.catalogo_equipo_id
       where ie.instalacion_id = $1`,
      [id],
    );
    return { ...r.rows[0], equipos: equipos.rows, valorEquiposUsd: valor.rows[0].valor };
  }

  async listarPorCliente(clienteId: string): Promise<Instalacion[]> {
    const r = await pool.query<{ id: string }>(
      'select id from instalaciones where cliente_id = $1 order by creada_en',
      [clienteId],
    );
    const instalaciones: Instalacion[] = [];
    for (const { id } of r.rows) {
      const instalacion = await this.obtenerInstalacion(id);
      if (instalacion) instalaciones.push(instalacion);
    }
    return instalaciones;
  }

  async crearServicio(d: NuevoServicio): Promise<Servicio> {
    const r = await pool.query<{ id: string }>(
      `insert into servicios (instalacion_id, tipo, monto_usd, vip) values ($1, $2, $3, $4) returning id`,
      [d.instalacionId, d.tipo, d.montoUsd, d.vip],
    );
    const s = await pool.query<Servicio>(`${consultaServicios} where s.id = $1`, [r.rows[0].id]);
    return s.rows[0];
  }

  async cambiarEstadoServicio(servicioId: string, estado: EstadoServicio): Promise<Servicio | null> {
    const r = await pool.query<{ id: string }>('update servicios set estado = $2 where id = $1 returning id', [
      servicioId,
      estado,
    ]);
    if (!r.rows[0]) return null;
    const s = await pool.query<Servicio>(`${consultaServicios} where s.id = $1`, [servicioId]);
    return s.rows[0];
  }

  async listarServicios(instalacionId: string): Promise<Servicio[]> {
    const r = await pool.query<Servicio>(`${consultaServicios} where s.instalacion_id = $1 order by s.creado_en`, [
      instalacionId,
    ]);
    return r.rows;
  }

  async registrarConformidad(c: Conformidad): Promise<Conformidad> {
    const r = await pool.query<Conformidad>(
      `insert into conformidades (servicio_id, estado, comentario) values ($1, $2, $3)
       on conflict (servicio_id) do update
         set estado = excluded.estado, comentario = excluded.comentario, registrada_en = now()
       returning servicio_id as "servicioId", estado, comentario`,
      [c.servicioId, c.estado, c.comentario],
    );
    return r.rows[0];
  }
}
