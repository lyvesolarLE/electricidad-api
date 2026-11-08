import { randomUUID } from 'node:crypto';
import type { PasarelaPago } from '../puertos/pasarela-pago.js';

/** Sin pasarela externa: el cobro queda pendiente y el personal lo confirma al recibir el dinero. */
export class PasarelaManual implements PasarelaPago {
  nombre = 'manual';

  async iniciarCobro(): Promise<{ referenciaExterna: string; urlPago: string | null }> {
    return { referenciaExterna: randomUUID(), urlPago: null };
  }
}
