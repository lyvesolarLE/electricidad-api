import { pool } from '../../../shared/db/pool.js';
import type { MensajeHistorial } from '../dominio/agente.js';
import type { MensajeEntrante, RepositorioMensajes } from '../puertos/whatsapp.js';

export class RepositorioMensajesPg implements RepositorioMensajes {
  async encolarEntrante(m: { waId: string; telefono: string; texto: string }): Promise<boolean> {
    const r = await pool.query(
      `insert into whatsapp_mensajes (wa_id, telefono, direccion, texto, estado)
       values ($1, $2, 'entrante', $3, 'pendiente')
       on conflict (wa_id) do nothing`,
      [m.waId, m.telefono, m.texto],
    );
    return (r.rowCount ?? 0) > 0;
  }

  // SKIP LOCKED permite varios workers sin que dos tomen el mismo mensaje.
  // No toma mensajes de un teléfono que ya tiene uno en proceso, para mantener el orden de la conversación.
  async reclamarSiguiente(): Promise<MensajeEntrante | null> {
    const r = await pool.query<MensajeEntrante>(
      `update whatsapp_mensajes set estado = 'procesando', intentos = intentos + 1, actualizado_en = now()
       where id = (
         select id from whatsapp_mensajes
         where direccion = 'entrante' and estado = 'pendiente' and proximo_intento <= now()
           and telefono not in (
             select telefono from whatsapp_mensajes where direccion = 'entrante' and estado = 'procesando'
           )
         order by creado_en
         for update skip locked
         limit 1
       )
       returning id, telefono, texto, intentos`,
    );
    return r.rows[0] ?? null;
  }

  async recuperarAtascados(): Promise<void> {
    await pool.query(
      `update whatsapp_mensajes set estado = 'pendiente', actualizado_en = now()
       where direccion = 'entrante' and estado = 'procesando' and actualizado_en < now() - interval '2 minutes'`,
    );
  }

  async marcarRespondido(id: string): Promise<void> {
    await pool.query(`update whatsapp_mensajes set estado = 'respondido', actualizado_en = now() where id = $1`, [id]);
  }

  async reintentarOFallar(id: string, intentos: number, error: string, maxIntentos: number): Promise<void> {
    await pool.query(
      `update whatsapp_mensajes
       set estado = case when $2::int >= $3::int then 'error' else 'pendiente' end,
           ultimo_error = $4,
           proximo_intento = now() + make_interval(secs => $2::int * 30),
           actualizado_en = now()
       where id = $1`,
      [id, intentos, maxIntentos, error.slice(0, 500)],
    );
  }

  async guardarSaliente(telefono: string, texto: string): Promise<void> {
    await pool.query(
      `insert into whatsapp_mensajes (telefono, direccion, texto, estado) values ($1, 'saliente', $2, 'enviado')`,
      [telefono, texto],
    );
  }

  async historial(telefono: string, limite: number): Promise<MensajeHistorial[]> {
    const r = await pool.query<MensajeHistorial>(
      `select direccion, texto from (
         select direccion, texto, creado_en from whatsapp_mensajes
         where telefono = $1 and estado <> 'error'
         order by creado_en desc limit $2
       ) t order by creado_en asc`,
      [telefono, limite],
    );
    return r.rows;
  }
}
