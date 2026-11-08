import type { PasarelaPago } from '../puertos/pasarela-pago.js';
import { PasarelaManual } from './pasarela-manual.js';

/**
 * Elige la pasarela con la variable PASARELA_PAGO (por defecto, "manual").
 * Para sumar EnZona, Transfermóvil u otra: crear su adaptador (que implemente PasarelaPago)
 * y registrarlo aquí. El resto del módulo no cambia.
 */
export function obtenerPasarela(nombre: string = process.env.PASARELA_PAGO ?? 'manual'): PasarelaPago {
  if (nombre === 'manual') return new PasarelaManual();
  throw new Error(`Pasarela de pago no disponible: ${nombre}`);
}
