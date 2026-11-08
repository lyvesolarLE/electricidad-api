import { pool } from '../../../shared/db/pool.js';
import type { Notificacion, NuevaNotificacion, RepositorioNotificaciones } from '../puertos/notificaciones.js';

const columnas = `id, telefono, tipo, texto, parametros, estado, intentos, ultimo_error as "ultimoError", creado_en as "creadaEn"`;

export class RepositorioNotificacionesPg implements RepositorioNotificaciones {
  async encolar(n: NuevaNotificacion): Promise<boolean> {
    const r = await pool.query(
      `insert into notificaciones (referencia, telefono, tipo, texto, parametros)
       values ($1, $2, $3, $4, $5::jsonb) on conflict (referencia) do nothing`,
      [n.referencia, n.telefono, n.tipo, n.contenido.texto, JSON.stringify(n.contenido.parametros)],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async reclamarSiguiente(): Promise<Notificacion | null> {
    const r = await pool.query<Notificacion>(
      `update notificaciones set estado = 'procesando', intentos = intentos + 1, actualizado_en = now()
       where id = (
         select id from notificaciones
         where estado = 'pendiente' and proximo_intento <= now()
         order by creado_en for update skip locked limit 1
       )
       returning ${columnas}`,
    );
    return r.rows[0] ?? null;
  }

  async recuperarAtascadas(): Promise<void> {
    await pool.query(
      `update notificaciones set estado = 'pendiente', actualizado_en = now()
       where estado = 'procesando' and actualizado_en < now() - interval '2 minutes'`,
    );
  }

  async marcarEnviada(id: string): Promise<void> {
    await pool.query(`update notificaciones set estado = 'enviada', actualizado_en = now() where id = $1`, [id]);
  }

  async marcarError(id: string, error: string): Promise<void> {
    await pool.query(
      `update notificaciones set estado = 'error', ultimo_error = $2, actualizado_en = now() where id = $1`,
      [id, error.slice(0, 500)],
    );
  }

  async reintentarOFallar(id: string, intentos: number, error: string, maxIntentos: number): Promise<void> {
    await pool.query(
      `update notificaciones
       set estado = case when $2::int >= $3::int then 'error' else 'pendiente' end,
           ultimo_error = $4,
           proximo_intento = now() + make_interval(secs => $2::int * 30),
           actualizado_en = now()
       where id = $1`,
      [id, intentos, maxIntentos, error.slice(0, 500)],
    );
  }

  async tieneMensajeReciente(telefono: string): Promise<boolean> {
    const r = await pool.query<{ existe: boolean }>(
      `select exists(
         select 1 from whatsapp_mensajes
         where telefono = $1 and direccion = 'entrante' and creado_en > now() - interval '24 hours'
       ) as existe`,
      [telefono],
    );
    return r.rows[0].existe;
  }

  async listar(estado?: string): Promise<Notificacion[]> {
    const r = await pool.query<Notificacion>(
      `select ${columnas} from notificaciones where ($1::text is null or estado = $1) order by creado_en desc limit 100`,
      [estado ?? null],
    );
    return r.rows;
  }

  async reintentar(id: string): Promise<boolean> {
    const r = await pool.query(
      `update notificaciones set estado = 'pendiente', intentos = 0, proximo_intento = now(), actualizado_en = now()
       where id = $1 and estado = 'error'`,
      [id],
    );
    return (r.rowCount ?? 0) > 0;
  }
}
