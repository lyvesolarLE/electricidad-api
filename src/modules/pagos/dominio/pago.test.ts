import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pendienteDePagar, validarSobrepago } from './pago.js';

test('calcula lo pendiente', () => {
  assert.equal(pendienteDePagar({ montoUsd: 300, pagadoUsd: 100.25 }), 199.75);
});

test('acepta pagar justo lo que falta', () => {
  assert.doesNotThrow(() => validarSobrepago({ montoUsd: 300, pagadoUsd: 100 }, 200));
});

test('rechaza un sobrepago', () => {
  assert.throws(() => validarSobrepago({ montoUsd: 300, pagadoUsd: 100 }, 200.5), /supera/);
});
