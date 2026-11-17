import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http/app.js';
import { setup } from './helpers.js';

describe('API HTTP', () => {
  let server;
  let baseUrl;

  before(async () => {
    const { db } = await setup();
    server = createApp(db).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  const call = (path, { userId = 1, method = 'GET', body } = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'X-User-Id': String(userId) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  test('rechaza peticiones sin usuario', async () => {
    const res = await call('/dashboard', { userId: null });
    assert.equal(res.status, 401);
  });

  test('rechaza usuarios inexistentes', async () => {
    const res = await call('/dashboard', { userId: 999 });
    assert.equal(res.status, 401);
  });

  test('valida el cuerpo y devuelve detalles por campo', async () => {
    const res = await call('/incidentes', { method: 'POST', body: { titulo: 'x' } });
    assert.equal(res.status, 400);
    const { error } = await res.json();
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.ok(error.details.some((d) => d.campo === 'servicioIds'));
  });

  test('responde JSON inválido con 400', async () => {
    const res = await fetch(`${baseUrl}/incidentes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': '1' },
      body: '{mal json',
    });
    assert.equal(res.status, 400);
  });

  test('crea un incidente y el dashboard refleja los servicios afectados', async () => {
    const created = await call('/incidentes', {
      method: 'POST',
      body: {
        titulo: 'Ransomware en facturación',
        descripcion: 'Nota de rescate encontrada en servidores de facturación.',
        severidad: 'alta',
        responsableId: 1,
        servicioIds: [5],
      },
    });
    assert.equal(created.status, 201);

    const dashboard = await (await call('/dashboard')).json();
    assert.equal(dashboard.resumen.afectado, 1);
    assert.equal(dashboard.incidentesAbiertos.length, 1);
  });

  test('las reglas de negocio responden 409 y los permisos 403', async () => {
    const decisionTooEarly = await call('/incidentes/1/decisiones', {
      method: 'POST',
      body: { respuesta: true, justificacion: 'Decisión prematura' },
    });
    assert.equal(decisionTooEarly.status, 409);

    const forbidden = await call('/incidentes/1/decisiones', {
      userId: 4,
      method: 'POST',
      body: { respuesta: true, justificacion: 'Sin permiso' },
    });
    assert.equal(forbidden.status, 403);
  });

  test('ids no numéricos y recursos inexistentes', async () => {
    assert.equal((await call('/incidentes/abc')).status, 400);
    assert.equal((await call('/incidentes/9999')).status, 404);
  });
});
