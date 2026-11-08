import type { EstadoPago, NuevoPago, Pago, SaldoServicio } from '../dominio/pago.js';

export interface RepositorioPagos {
  registrar(pago: NuevoPago): Promise<Pago>;
  obtener(id: string): Promise<Pago | null>;
  cambiarEstado(id: string, estado: EstadoPago): Promise<Pago | null>;
  listarPorServicio(servicioId: string): Promise<Pago[]>;
  /** Monto del servicio y total ya confirmado; null si el servicio no existe. */
  saldo(servicioId: string): Promise<SaldoServicio | null>;
}
