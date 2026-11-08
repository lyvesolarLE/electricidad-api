import { CircuitBreaker } from '../../../shared/circuit-breaker.js';
import { fetchConTimeout } from '../../../shared/http.js';
import type { CanalMensajes } from '../puertos/whatsapp.js';

export class WhatsAppCloudApi implements CanalMensajes {
  private breaker = new CircuitBreaker();

  constructor(
    private accessToken: string,
    private phoneNumberId: string,
    private apiVersion: string,
  ) {}

  enviarTexto(telefono: string, texto: string): Promise<void> {
    return this.breaker.ejecutar(async () => {
      const res = await fetchConTimeout(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.accessToken}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, type: 'text', text: { body: texto } }),
        },
        10_000,
      );
      if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    });
  }

  enviarPlantilla(telefono: string, plantilla: string, idioma: string, parametros: string[]): Promise<void> {
    return this.breaker.ejecutar(async () => {
      const template = {
        name: plantilla,
        language: { code: idioma },
        ...(parametros.length > 0
          ? { components: [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) }] }
          : {}),
      };
      const res = await fetchConTimeout(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.accessToken}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, type: 'template', template }),
        },
        10_000,
      );
      if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    });
  }
}
