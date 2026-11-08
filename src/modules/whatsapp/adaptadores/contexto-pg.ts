import { RepositorioClientesPg } from '../../clientes/adaptadores/repositorio-clientes-pg.js';
import { RepositorioTarifasPg } from '../../cotizaciones/adaptadores/cotizaciones-pg.js';
import { RepositorioInstalacionesPg } from '../../instalaciones/adaptadores/repositorio-instalaciones-pg.js';
import { formatearContexto } from '../dominio/agente.js';
import type { ContextoClientes } from '../puertos/whatsapp.js';

export class ContextoClientesPg implements ContextoClientes {
  private clientes = new RepositorioClientesPg();
  private instalaciones = new RepositorioInstalacionesPg();
  private tarifas = new RepositorioTarifasPg();

  async textoPara(telefono: string): Promise<string> {
    const [cliente, tarifas] = await Promise.all([this.clientes.buscarPorTelefono(telefono), this.tarifas.listar()]);
    if (!cliente) return formatearContexto({ cliente: null, instalaciones: [], tarifas });

    const lista = await this.instalaciones.listarPorCliente(cliente.id);
    const instalaciones = await Promise.all(
      lista.map(async (i) => ({
        direccion: i.direccion,
        instaladaPorEmpresa: i.instaladaPorEmpresa,
        valorEquiposUsd: i.valorEquiposUsd,
        servicios: await this.instalaciones.listarServicios(i.id),
      })),
    );
    return formatearContexto({ cliente: { nombre: cliente.nombre, vip: cliente.vip }, instalaciones, tarifas });
  }
}
