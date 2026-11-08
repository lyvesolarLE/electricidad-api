import type { Cliente, NuevoCliente } from '../dominio/cliente.js';

export interface RepositorioClientes {
  crear(cliente: NuevoCliente): Promise<Cliente>;
  listar(): Promise<Cliente[]>;
  buscarPorId(id: string): Promise<Cliente | null>;
  /** Compara solo los dígitos, así +53 5555 1234 y 5355551234 son el mismo número. */
  buscarPorTelefono(telefono: string): Promise<Cliente | null>;
}
