import type { Tarifa } from '../../cotizaciones/dominio/cotizacion.js';
import type { Servicio } from '../../instalaciones/dominio/instalacion.js';

export interface MensajeHistorial {
  direccion: 'entrante' | 'saliente';
  texto: string;
}

export interface TurnoModelo {
  rol: 'user' | 'assistant';
  contenido: string;
}

/** El modelo exige turnos alternados que empiecen y terminen con el cliente. */
export function normalizarHistorial(historial: MensajeHistorial[]): TurnoModelo[] {
  const turnos: TurnoModelo[] = [];
  for (const m of historial) {
    const rol = m.direccion === 'entrante' ? 'user' : 'assistant';
    const ultimo = turnos.at(-1);
    if (ultimo && ultimo.rol === rol) ultimo.contenido += `\n${m.texto}`;
    else turnos.push({ rol, contenido: m.texto });
  }
  while (turnos[0]?.rol === 'assistant') turnos.shift();
  while (turnos.at(-1)?.rol === 'assistant') turnos.pop();
  return turnos;
}

export interface DatosContexto {
  cliente: { nombre: string; vip: boolean } | null;
  instalaciones: {
    direccion: string | null;
    instaladaPorEmpresa: boolean;
    valorEquiposUsd: number;
    servicios: Servicio[];
  }[];
  tarifas: Tarifa[];
}

const nombresConcepto: Record<string, string> = {
  asesoria: 'Asesoría',
  mantenimiento: 'Mantenimiento',
  mano_de_obra: 'Mano de obra',
  monitoreo: 'Monitoreo',
  atencion_vip: 'Atención VIP (recargo)',
};

const usd = (n: number) => `${n.toFixed(2)} USD`;

export function formatearContexto(d: DatosContexto): string {
  const lineas: string[] = [];

  lineas.push('TARIFAS (referencia; la cotización definitiva la confirma el equipo):');
  for (const t of d.tarifas) {
    const nombre = nombresConcepto[t.concepto] ?? t.concepto;
    lineas.push(`- ${nombre}: ${t.tipo === 'fijo' ? usd(t.valor) : `${t.valor} % del valor de los equipos instalados`}`);
  }

  lineas.push('');
  if (!d.cliente) {
    lineas.push('CLIENTE: este número no está registrado todavía.');
    return lineas.join('\n');
  }

  lineas.push(`CLIENTE: ${d.cliente.nombre} (atención VIP: ${d.cliente.vip ? 'sí' : 'no'})`);
  if (d.instalaciones.length === 0) lineas.push('Sin instalaciones registradas.');
  for (const i of d.instalaciones) {
    lineas.push(
      `Instalación en ${i.direccion ?? 'dirección no registrada'} — equipos valorados en ${usd(i.valorEquiposUsd)} — ` +
        `${i.instaladaPorEmpresa ? 'instalada por EL&ectricidad' : 'instalada por terceros'}`,
    );
    for (const s of i.servicios) {
      const nombre = nombresConcepto[s.tipo] ?? s.tipo;
      lineas.push(
        `  · ${nombre}: ${usd(s.montoUsd)}, pagado ${usd(s.pagadoUsd)}, estado ${s.estado}, conformidad ${s.conformidad ?? 'sin registrar'}`,
      );
    }
  }
  return lineas.join('\n');
}

export function construirSistema(contexto: string): string {
  return `Eres el asistente de WhatsApp de EL&ectricidad (Soluciones Energéticas), empresa cubana de instalación de sistemas fotovoltaicos. Ofrecemos asesoría, instalación, mantenimiento y monitoreo.

Cómo responder:
- Español claro y cercano, mensajes cortos (cabe en una pantalla de teléfono), sin formato especial.
- Usa solo los datos de abajo. Si algo no está ahí, dilo y no lo inventes.
- No puedes agendar visitas, cobrar, ni modificar nada: solo informar y orientar. Nunca digas que hiciste una acción.
- Si el cliente quiere cotizar, explica las tarifas de referencia y aclara que el equipo confirma el monto final.
- Si hay una queja, una avería urgente o piden hablar con una persona, indica que un miembro del equipo lo contactará y recoge brevemente el problema.
- Si es VIP, trátalo con prioridad y cercanía, sin mencionar recargos a menos que pregunte.

${contexto}`;
}
