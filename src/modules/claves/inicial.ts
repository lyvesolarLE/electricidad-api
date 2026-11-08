import { hashClave } from './autenticacion.js';
import type { RepositorioClavesPg } from './claves-pg.js';

/**
 * Primer arranque: si no existe ninguna clave y está definida CLAVE_ADMIN_INICIAL, la crea como administrador.
 * Después se pueden crear más claves con POST /claves y quitar esa variable.
 */
export async function asegurarClaveInicial(
  repo: RepositorioClavesPg,
  log: { warn: (msg: string) => void; info: (msg: string) => void },
): Promise<void> {
  if ((await repo.contar()) > 0) return;

  const inicial = process.env.CLAVE_ADMIN_INICIAL;
  if (!inicial) {
    log.warn('No hay claves de API: define CLAVE_ADMIN_INICIAL para crear la primera clave de administrador');
    return;
  }
  if (inicial.length < 32) throw new Error('CLAVE_ADMIN_INICIAL debe tener al menos 32 caracteres');

  await repo.crear('admin inicial', 'admin', hashClave(inicial));
  log.info('Clave de administrador inicial creada');
}
