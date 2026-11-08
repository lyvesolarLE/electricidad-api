import { errorDeNegocio } from '../../../shared/errores.js';

export type EstadoPago = 'pendiente' | 'confirmado' | 'rechazado';

export interface Pago {
  id: string;
  servicioId: string;
  montoUsd: number;
  metodo: string;
  referencia: string | null;
  estado: EstadoPago;
  pasarela: string;
  referenciaExterna: string | null;
  pagadoEn: string;
}

export type NuevoPago = Omit<Pago, 'id' | 'pagadoEn'>;

export interface SaldoServicio {
  montoUsd: number;
  pagadoUsd: number;
}

export function pendienteDePagar(saldo: SaldoServicio): number {
  return Math.round((saldo.montoUsd - saldo.pagadoUsd) * 100) / 100;
}

/** Regla: un pago no puede superar lo que falta por pagar del servicio. */
export function validarSobrepago(saldo: SaldoServicio, montoNuevoUsd: number): void {
  const pendiente = pendienteDePagar(saldo);
  if (montoNuevoUsd > pendiente + 0.001) {
    throw errorDeNegocio(`El monto supera lo que falta por pagar (${pendiente.toFixed(2)} USD)`);
  }
}
