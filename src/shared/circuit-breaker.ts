/** Corta las llamadas a un servicio externo que falla seguido, para no acumular esperas ni errores. */
export class CircuitBreaker {
  private fallos = 0;
  private abiertoHasta = 0;

  constructor(
    private umbral = 5,
    private enfriamientoMs = 60_000,
  ) {}

  async ejecutar<T>(fn: () => Promise<T>): Promise<T> {
    if (Date.now() < this.abiertoHasta) throw new Error('Servicio externo no disponible (circuito abierto)');
    try {
      const resultado = await fn();
      this.fallos = 0;
      return resultado;
    } catch (error) {
      this.fallos += 1;
      if (this.fallos >= this.umbral) {
        this.abiertoHasta = Date.now() + this.enfriamientoMs;
        this.fallos = 0;
      }
      throw error;
    }
  }
}
