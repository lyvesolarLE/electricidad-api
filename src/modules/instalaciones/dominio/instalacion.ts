export type TipoServicio = 'asesoria' | 'mantenimiento' | 'mano_de_obra' | 'monitoreo' | 'atencion_vip';
export type EstadoServicio = 'cotizado' | 'aceptado' | 'en_curso' | 'completado' | 'cancelado';
export type EstadoConformidad = 'pendiente' | 'conforme' | 'no_conforme';

export interface EquipoCatalogo {
  id: string;
  marca: string;
  modelo: string;
  tipo: string;
  potenciaW: number | null;
  precioReferenciaUsd: number;
}
export type NuevoEquipoCatalogo = Omit<EquipoCatalogo, 'id'>;

export interface EquipoInstalado {
  catalogoEquipoId: string;
  cantidad: number;
  precioUnitarioUsd: number | null;
}

export interface NuevaInstalacion {
  clienteId: string;
  direccion: string | null;
  instaladaPorEmpresa: boolean;
  fechaInstalacion: string | null;
  equipos: EquipoInstalado[];
}

export interface Instalacion {
  id: string;
  clienteId: string;
  direccion: string | null;
  instaladaPorEmpresa: boolean;
  fechaInstalacion: string | null;
  equipos: EquipoInstalado[];
  /** Suma de cantidad × precio pagado (o precio de referencia de mercado si no hay precio propio). */
  valorEquiposUsd: number;
}

export interface NuevoServicio {
  instalacionId: string;
  tipo: TipoServicio;
  montoUsd: number;
  vip: boolean;
}

export interface Servicio {
  id: string;
  instalacionId: string;
  tipo: TipoServicio;
  montoUsd: number;
  vip: boolean;
  estado: EstadoServicio;
  pagadoUsd: number;
  conformidad: EstadoConformidad | null;
}

export interface Conformidad {
  servicioId: string;
  estado: EstadoConformidad;
  comentario: string | null;
}
