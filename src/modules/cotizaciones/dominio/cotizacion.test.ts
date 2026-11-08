import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONCEPTOS_BASE, calcularCotizacion, type Tarifa } from './cotizacion.js';

const tarifas: Tarifa[] = [
  { concepto: 'asesoria', tipo: 'fijo', valor: 15 },
  { concepto: 'mantenimiento', tipo: 'porcentaje', valor: 3 },
  { concepto: 'mano_de_obra', tipo: 'porcentaje', valor: 20 },
  { concepto: 'monitoreo', tipo: 'porcentaje', valor: 2 },
  { concepto: 'atencion_vip', tipo: 'porcentaje', valor: 1.5 },
];

test('equipos de 10.000 USD sin VIP', () => {
  const c = calcularCotizacion({
    instalacionId: 'x',
    valorEquiposUsd: 10000,
    tarifas,
    conceptos: CONCEPTOS_BASE,
    vip: false,
  });
  assert.deepEqual(
    c.lineas.map((l) => l.montoUsd),
    [15, 300, 2000, 200],
  );
  assert.equal(c.totalUsd, 2515);
});

test('con VIP suma 1,5 % del valor de los equipos una vez', () => {
  const c = calcularCotizacion({
    instalacionId: 'x',
    valorEquiposUsd: 10000,
    tarifas,
    conceptos: CONCEPTOS_BASE,
    vip: true,
  });
  assert.equal(c.lineas.at(-1)?.montoUsd, 150);
  assert.equal(c.totalUsd, 2665);
});

test('solo monitoreo y redondeo al centavo', () => {
  const c = calcularCotizacion({
    instalacionId: 'x',
    valorEquiposUsd: 1234.57,
    tarifas,
    conceptos: ['monitoreo'],
    vip: false,
  });
  assert.equal(c.totalUsd, 24.69);
});

test('falta una tarifa', () => {
  assert.throws(() =>
    calcularCotizacion({ instalacionId: 'x', valorEquiposUsd: 100, tarifas: [], conceptos: ['monitoreo'], vip: false }),
  );
});
