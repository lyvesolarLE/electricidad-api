import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { generarClave, hashClave, registrarAutenticacion, type ClaveApi } from './autenticacion.js';

test('formato y hash de las claves', () => {
  const a = generarClave();
  assert.match(a, /^elk_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, generarClave());
  assert.equal(hashClave('x'), hashClave('x'));
  assert.notEqual(hashClave('x'), hashClave('y'));
});

test('rutas públicas, privadas y de administrador', async () => {
  const claves = new Map<string, ClaveApi>([
    [hashClave('clave-admin'), { id: '1', nombre: 'admin', rol: 'admin' }],
    [hashClave('clave-operador'), { id: '2', nombre: 'operador', rol: 'operador' }],
  ]);
  const app = Fastify();
  registrarAutenticacion(app, async (hash) => claves.get(hash) ?? null);
  app.get('/publica', { config: { publica: true } }, async () => ({ ok: true }));
  app.get('/privada', async () => ({ ok: true }));
  app.get('/solo-admin', { config: { rol: 'admin' } }, async () => ({ ok: true }));
  await app.ready();

  const pedir = async (url: string, clave?: string) =>
    (await app.inject({ method: 'GET', url, headers: clave ? { authorization: `Bearer ${clave}` } : {} })).statusCode;

  assert.equal(await pedir('/publica'), 200);
  assert.equal(await pedir('/privada'), 401);
  assert.equal(await pedir('/privada', 'inventada'), 401);
  assert.equal(await pedir('/privada', 'clave-operador'), 200);
  assert.equal(await pedir('/solo-admin', 'clave-operador'), 403);
  assert.equal(await pedir('/solo-admin', 'clave-admin'), 200);
  assert.equal(await pedir('/solo-admin'), 401);
  await app.close();
});
