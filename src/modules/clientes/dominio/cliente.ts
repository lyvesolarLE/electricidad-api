export interface Cliente {
  id: string;
  nombre: string;
  telefonoWhatsapp: string;
  email: string | null;
  direccion: string | null;
  vip: boolean;
}

export type NuevoCliente = Omit<Cliente, 'id'>;
