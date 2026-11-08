export type TipoNotificacion = 'bienvenida' | 'recibo_pago' | 'servicio_completado';

export interface Contenido {
  /** Texto libre, para clientes que escribieron en las últimas 24 h. */
  texto: string;
  /** Parámetros {{1}}, {{2}}... de la plantilla aprobada, en este orden. */
  parametros: string[];
}

const nombresServicio: Record<string, string> = {
  asesoria: 'asesoría',
  mantenimiento: 'mantenimiento',
  mano_de_obra: 'mano de obra',
  monitoreo: 'monitoreo',
  atencion_vip: 'atención VIP',
};

export const nombreServicio = (tipo: string): string => nombresServicio[tipo] ?? tipo;

const usd = (n: number): string => n.toFixed(2);

export function bienvenida(nombre: string): Contenido {
  return {
    texto: `Hola ${nombre}, bienvenido/a a EL&ectricidad. Puedes escribirnos por aquí para consultas de asesoría, mantenimiento o monitoreo de tu sistema solar.`,
    parametros: [nombre],
  };
}

export function reciboPago(d: { nombre: string; montoUsd: number; tipoServicio: string; saldoUsd: number }): Contenido {
  const servicio = nombreServicio(d.tipoServicio);
  const saldo = d.saldoUsd > 0.001 ? `Saldo pendiente: ${usd(d.saldoUsd)} USD.` : 'El servicio quedó pagado por completo.';
  return {
    texto: `Hola ${d.nombre}, recibimos tu pago de ${usd(d.montoUsd)} USD por el servicio de ${servicio}. ${saldo} ¡Gracias!`,
    parametros: [d.nombre, usd(d.montoUsd), servicio, saldo],
  };
}

export function servicioCompletado(d: { nombre: string; tipoServicio: string }): Contenido {
  const servicio = nombreServicio(d.tipoServicio);
  return {
    texto: `Hola ${d.nombre}, el servicio de ${servicio} ya quedó completado. Cuéntanos por aquí cómo quedó todo; si tienes alguna observación, el equipo la revisa.`,
    parametros: [d.nombre, servicio],
  };
}
