/**
 * Puerto de la pasarela de pago. Cada pasarela (manual, EnZona, Transfermóvil...) es un adaptador
 * que lo implementa; el resto del sistema no sabe cuál se usa.
 */
export interface PasarelaPago {
  nombre: string;
  iniciarCobro(datos: { servicioId: string; montoUsd: number }): Promise<{
    referenciaExterna: string;
    /** Enlace para que el cliente pague, si la pasarela lo ofrece. */
    urlPago: string | null;
  }>;
}
