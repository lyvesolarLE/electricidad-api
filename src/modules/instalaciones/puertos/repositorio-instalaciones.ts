import type {
  Conformidad,
  EstadoServicio,
  EquipoCatalogo,
  Instalacion,
  NuevaInstalacion,
  NuevoEquipoCatalogo,
  NuevoServicio,
  Servicio,
} from '../dominio/instalacion.js';

export interface RepositorioInstalaciones {
  crearEquipoCatalogo(equipo: NuevoEquipoCatalogo): Promise<EquipoCatalogo>;
  listarCatalogo(): Promise<EquipoCatalogo[]>;
  crearInstalacion(datos: NuevaInstalacion): Promise<Instalacion>;
  obtenerInstalacion(id: string): Promise<Instalacion | null>;
  listarPorCliente(clienteId: string): Promise<Instalacion[]>;
  crearServicio(datos: NuevoServicio): Promise<Servicio>;
  listarServicios(instalacionId: string): Promise<Servicio[]>;
  cambiarEstadoServicio(servicioId: string, estado: EstadoServicio): Promise<Servicio | null>;
  registrarConformidad(conformidad: Conformidad): Promise<Conformidad>;
}
