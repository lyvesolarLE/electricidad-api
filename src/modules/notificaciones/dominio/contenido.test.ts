import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bienvenida, reciboPago, servicioCompletado } from './contenido.js';

test('recibo con saldo pendiente', () => {
  const c = reciboPago({ nombre: 'Ana', montoUsd: 100, tipoServicio: 'mantenimiento', saldoUsd: 200 });
  assert.match(c.texto, /100\.00 USD por el servicio de mantenimiento/);
  assert.match(c.texto, /Saldo pendiente: 200\.00 USD/);
  assert.equal(c.parametros.length, 4);
});

test('recibo con servicio pagado por completo', () => {
  const c = reciboPago({ nombre: 'Ana', montoUsd: 300, tipoServicio: 'monitoreo', saldoUsd: 0 });
  assert.match(c.texto, /pagado por completo/);
});

test('bienvenida y servicio completado', () => {
  assert.deepEqual(bienvenida('Luis').parametros, ['Luis']);
  assert.deepEqual(servicioCompletado({ nombre: 'Luis', tipoServicio: 'mano_de_obra' }).parametros, ['Luis', 'mano de obra']);
});
