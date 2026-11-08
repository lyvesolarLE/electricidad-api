import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { formatearContexto, normalizarHistorial } from './agente.js';
import { firmaValida } from './firma.js';
import { extraerMensajes } from './mensajes.js';

test('firma válida e inválida', () => {
  const cuerpo = Buffer.from('{"a":1}');
  const buena = 'sha256=' + createHmac('sha256', 'secreto').update(cuerpo).digest('hex');
  assert.equal(firmaValida(cuerpo, buena, 'secreto'), true);
  assert.equal(firmaValida(cuerpo, buena, 'otro'), false);
  assert.equal(firmaValida(cuerpo, undefined, 'secreto'), false);
  assert.equal(firmaValida(cuerpo, 'sha256=abc', 'secreto'), false);
});

test('extrae mensajes de texto y marca los que no son texto', () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: 'm1', from: '5355551234', type: 'text', text: { body: 'Hola' } },
                { id: 'm2', from: '5355551234', type: 'image' },
              ],
            },
          },
        ],
      },
    ],
  };
  const r = extraerMensajes(payload);
  assert.equal(r.length, 2);
  assert.equal(r[0].texto, 'Hola');
  assert.match(r[1].texto, /no es texto/);
  assert.deepEqual(extraerMensajes({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }), []);
  assert.deepEqual(extraerMensajes(null), []);
});

test('normaliza el historial: une turnos repetidos y termina con el cliente', () => {
  const turnos = normalizarHistorial([
    { direccion: 'saliente', texto: 'respuesta vieja' },
    { direccion: 'entrante', texto: 'hola' },
    { direccion: 'entrante', texto: 'precio?' },
    { direccion: 'saliente', texto: 'claro' },
    { direccion: 'entrante', texto: 'gracias' },
  ]);
  assert.deepEqual(
    turnos.map((t) => t.rol),
    ['user', 'assistant', 'user'],
  );
  assert.equal(turnos[0].contenido, 'hola\nprecio?');
});

test('contexto de cliente no registrado y registrado', () => {
  const tarifas = [{ concepto: 'asesoria' as const, tipo: 'fijo' as const, valor: 15 }];
  assert.match(formatearContexto({ cliente: null, instalaciones: [], tarifas }), /no está registrado/);
  const texto = formatearContexto({
    cliente: { nombre: 'Ana', vip: true },
    instalaciones: [{ direccion: 'Calle 1', instaladaPorEmpresa: true, valorEquiposUsd: 10000, servicios: [] }],
    tarifas,
  });
  assert.match(texto, /Ana/);
  assert.match(texto, /10000\.00 USD/);
});
