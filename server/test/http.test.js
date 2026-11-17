import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { EMAILS, startServer } from './httpHelpers.js';

describe('API HTTP', () => {
  let srv;
  let coord;

  before(async () => {
    const { db } = await setup();
    srv = await startServer(db);
    coord = srv.client();
    assert.equal((await coord.login(EMAILS.coordinador)).status, 200);
  });

  after(() => srv.close());

  test('rechaza peticiones sin sesión', async () => {
    const res = await srv.client().call('/dashboard');
    assert.equal(res.status, 401);
  });

  test('una cookie alterada no sirve', async () => {
    const res = await fetch(`${srv.baseUrl}/dashboard`, { headers: { Cookie: `${coord.cookie}x` } });
    assert.equal(res.status, 401);
  });

  test('valida el cuerpo y devuelve detalles por campo', async () => {
    const res = await coord.call('/incidentes', { method: 'POST', body: { titulo: 'x' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.details.some((d) => d.campo === 'servicioIds'));
  });

  test('responde JSON inválido con 400', async () => {
    const res = await fetch(`${srv.baseUrl}/incidentes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Cookie: coord.cookie },
      body: '{mal json',
    });
    assert.equal(res.status, 400);
  });

  test('crea un incidente y el dashboard refleja los servicios afectados', async () => {
    const created = await coord.call('/incidentes', {
      method: 'POST',
      body: { titulo: 'Ransomware en facturación', descripcion: 'Nota de rescate encontrada en servidores de facturación.', severidad: 'alta', responsableId: 1, servicioIds: [5] },
    });
    assert.equal(created.status, 201);
    const dashboard = await coord.call('/dashboard');
    assert.equal(dashboard.body.resumen.afectado, 1);
    assert.equal(dashboard.body.incidentesAbiertos.length, 1);
  });

  test('las reglas de negocio responden 409 y los permisos 403', async () => {
    const early = await coord.call('/incidentes/1/decisiones', { method: 'POST', body: { respuesta: true, justificacion: 'Decisión prematura' } });
    assert.equal(early.status, 409);

    const legal = srv.client();
    await legal.login(EMAILS.legal);
    const forbidden = await legal.call('/incidentes/1/decisiones', { method: 'POST', body: { respuesta: true, justificacion: 'Sin permiso' } });
    assert.equal(forbidden.status, 403);
  });

  test('ids no numéricos y recursos inexistentes', async () => {
    assert.equal((await coord.call('/incidentes/abc')).status, 400);
    assert.equal((await coord.call('/incidentes/9999')).status, 404);
  });
});
