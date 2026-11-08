export function errorDeNegocio(mensaje: string, statusCode = 422): Error {
  return Object.assign(new Error(mensaje), { statusCode });
}
