export type Concepto = 'asesoria' | 'mantenimiento' | 'mano_de_obra' | 'monitoreo' | 'atencion_vip';

export const CONCEPTOS_BASE: Concepto[] = ['asesoria', 'mantenimiento', 'mano_de_obra', 'monitoreo'];

export interface Tarifa {
  concepto: Concepto;
  tipo: 'fijo' | 'porcentaje';
  /** Si es 'fijo', USD; si es 'porcentaje', porcentaje del valor de los equipos (3 = 3 %). */
  valor: number;
}

export interface LineaCotizacion {
  concepto: Concepto;
  montoUsd: number;
}

export interface Cotizacion {
  instalacionId: string;
  valorEquiposUsd: number;
  vip: boolean;
  lineas: LineaCotizacion[];
  totalUsd: number;
}

function errorDeNegocio(mensaje: string): Error {
  return Object.assign(new Error(mensaje), { statusCode: 422 });
}

function montoDe(tarifa: Tarifa, valorEquiposUsd: number): number {
  if (tarifa.tipo === 'fijo') return Math.round(tarifa.valor * 100) / 100;
  // valor × porcentaje / 100, redondeado al centavo
  return Math.round(valorEquiposUsd * tarifa.valor) / 100;
}

export interface DatosCotizacion {
  instalacionId: string;
  valorEquiposUsd: number;
  tarifas: Tarifa[];
  conceptos: Concepto[];
  vip: boolean;
}

/**
 * Regla de negocio pura (sin base de datos):
 * - asesoría: monto fijo; mantenimiento, mano de obra y monitoreo: % del valor de los equipos.
 * - atención VIP: un recargo único por cotización, como % del valor total de los equipos.
 */
export function calcularCotizacion(d: DatosCotizacion): Cotizacion {
  const buscar = (concepto: Concepto): Tarifa => {
    const tarifa = d.tarifas.find((t) => t.concepto === concepto);
    if (!tarifa) throw errorDeNegocio(`Falta la tarifa de ${concepto}`);
    return tarifa;
  };

  const lineas: LineaCotizacion[] = d.conceptos
    .filter((c) => c !== 'atencion_vip')
    .map((concepto) => ({ concepto, montoUsd: montoDe(buscar(concepto), d.valorEquiposUsd) }));

  if (d.vip) {
    lineas.push({ concepto: 'atencion_vip', montoUsd: montoDe(buscar('atencion_vip'), d.valorEquiposUsd) });
  }

  const totalUsd = Math.round(lineas.reduce((suma, l) => suma + l.montoUsd * 100, 0)) / 100;
  return { instalacionId: d.instalacionId, valorEquiposUsd: d.valorEquiposUsd, vip: d.vip, lineas, totalUsd };
}
