import { CircuitBreaker } from '../../../shared/circuit-breaker.js';
import { fetchConTimeout } from '../../../shared/http.js';
import type { TurnoModelo } from '../dominio/agente.js';
import type { ModeloIA } from '../puertos/whatsapp.js';

export class ClaudeApi implements ModeloIA {
  private breaker = new CircuitBreaker();

  constructor(
    private apiKey: string,
    private modelo: string,
  ) {}

  responder(sistema: string, mensajes: TurnoModelo[]): Promise<string> {
    return this.breaker.ejecutar(async () => {
      const res = await fetchConTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.modelo,
            max_tokens: 600,
            system: sistema,
            messages: mensajes.map((m) => ({ role: m.rol, content: m.contenido })),
          }),
        },
        20_000,
      );
      if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { content: { type: string; text?: string }[] };
      const texto = data.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim();
      if (!texto) throw new Error('Respuesta vacía del modelo');
      return texto;
    });
  }
}
