import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verifica que el webhook venga de Meta: cabecera X-Hub-Signature-256 = sha256 HMAC del cuerpo con el app secret. */
export function firmaValida(cuerpo: Buffer, cabecera: string | undefined, secreto: string): boolean {
  if (!cabecera?.startsWith('sha256=')) return false;
  const esperado = Buffer.from(createHmac('sha256', secreto).update(cuerpo).digest('hex'));
  const recibido = Buffer.from(cabecera.slice('sha256='.length));
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
