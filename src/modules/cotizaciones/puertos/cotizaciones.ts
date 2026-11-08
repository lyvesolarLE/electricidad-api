import type { Servicio } from '../../instalaciones/dominio/instalacion.js';
import type { Concepto, LineaCotizacion, Tarifa } from '../dominio/cotizacion.js';

export interface RepositorioTarifas {
  listar(): Promise<Tarifa[]>;
  actualizar(concepto: Concepto, valor: number): Promise<Tarifa | null>;
}

export interface ContextoCotizacion {
  valorEquiposUsd: number;
  clienteVip: boolean;
}

export interface OrigenContexto {
  obtener(instalacionId: string): Promise<ContextoCotizacion | null>;
}

export interface RegistroServicios {
  /** Crea todos los servicios de una cotización de forma atómica (todos o ninguno). */
  crear(instalacionId: string, lineas: LineaCotizacion[], vip: boolean): Promise<Servicio[]>;
}
