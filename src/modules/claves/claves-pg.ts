import { pool } from '../../shared/db/pool.js';
import type { ClaveApi, Rol } from './autenticacion.js';

export interface ClaveListada {
  id: string;
  nombre: string;
  rol: Rol;
  activa: boolean;
  creadaEn: string;
  ultimoUso: string | null;
}

export class RepositorioClavesPg {
  async buscarPorHash(hash: string): Promise<ClaveApi | null> {
    const r = await pool.query<ClaveApi>('select id, nombre, rol from api_keys where hash = $1 and activa', [hash]);
    const clave = r.rows[0];
    if (!clave) return null;
    // Se anota el último uso como máximo una vez por hora, para no escribir en cada petición.
    void pool
      .query(
        `update api_keys set ultimo_uso = now()
         where id = $1 and (ultimo_uso is null or ultimo_uso < now() - interval '1 hour')`,
        [clave.id],
      )
      .catch(() => undefined);
    return clave;
  }

  async crear(nombre: string, rol: Rol, hash: string): Promise<string> {
    const r = await pool.query<{ id: string }>(
      'insert into api_keys (nombre, rol, hash) values ($1, $2, $3) returning id',
      [nombre, rol, hash],
    );
    return r.rows[0].id;
  }

  async contar(): Promise<number> {
    const r = await pool.query<{ total: number }>('select count(*)::int as total from api_keys');
    return r.rows[0].total;
  }

  async listar(): Promise<ClaveListada[]> {
    const r = await pool.query<ClaveListada>(
      `select id, nombre, rol, activa, creada_en as "creadaEn", ultimo_uso as "ultimoUso"
       from api_keys order by creada_en`,
    );
    return r.rows;
  }

  /** No permite dejar el sistema sin ningún administrador activo. */
  async revocar(id: string): Promise<'ok' | 'no_existe' | 'ultimo_admin'> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(7001)');
      const actual = await client.query<{ rol: Rol; activa: boolean }>(
        'select rol, activa from api_keys where id = $1',
        [id],
      );
      if (!actual.rows[0]) {
        await client.query('rollback');
        return 'no_existe';
      }
      if (actual.rows[0].rol === 'admin' && actual.rows[0].activa) {
        const admins = await client.query<{ total: number }>(
          `select count(*)::int as total from api_keys where rol = 'admin' and activa`,
        );
        if (admins.rows[0].total <= 1) {
          await client.query('rollback');
          return 'ultimo_admin';
        }
      }
      await client.query('update api_keys set activa = false where id = $1', [id]);
      await client.query('commit');
      return 'ok';
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
