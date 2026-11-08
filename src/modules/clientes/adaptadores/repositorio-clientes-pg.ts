import { pool } from '../../../shared/db/pool.js';
import type { Cliente, NuevoCliente } from '../dominio/cliente.js';
import type { RepositorioClientes } from '../puertos/repositorio-clientes.js';

const columnas = `id, nombre, telefono_whatsapp as "telefonoWhatsapp", email, direccion, vip`;

export class RepositorioClientesPg implements RepositorioClientes {
  async crear(c: NuevoCliente): Promise<Cliente> {
    const r = await pool.query<Cliente>(
      `insert into clientes (nombre, telefono_whatsapp, email, direccion, vip)
       values ($1, $2, $3, $4, $5) returning ${columnas}`,
      [c.nombre, c.telefonoWhatsapp, c.email, c.direccion, c.vip],
    );
    return r.rows[0];
  }

  async listar(): Promise<Cliente[]> {
    const r = await pool.query<Cliente>(`select ${columnas} from clientes order by creado_en desc`);
    return r.rows;
  }

  async buscarPorTelefono(telefono: string): Promise<Cliente | null> {
    const digitos = telefono.replace(/\D/g, '');
    const r = await pool.query<Cliente>(
      `select ${columnas} from clientes where regexp_replace(telefono_whatsapp, '\D', '', 'g') = $1`,
      [digitos],
    );
    return r.rows[0] ?? null;
  }

  async buscarPorId(id: string): Promise<Cliente | null> {
    const r = await pool.query<Cliente>(`select ${columnas} from clientes where id = $1`, [id]);
    return r.rows[0] ?? null;
  }
}
