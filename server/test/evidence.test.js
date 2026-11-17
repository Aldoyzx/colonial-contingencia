import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createIncident } from '../src/services/incidentService.js';
import { baseIncident, setup } from './helpers.js';
import { EMAILS, startServer, testConfig } from './httpHelpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const LOG = Buffer.from('2021-05-07T05:32:11Z EDR ALERTA cifrado masivo en FACT-SRV-02\n');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
const HTML_AS_PNG = Buffer.from('<html><script>alert(1)</script></html>');

const form = (buffer, name, fields = {}) => {
  const data = new FormData();
  data.append('archivo', new Blob([buffer]), name);
  Object.entries(fields).forEach(([k, v]) => data.append(k, String(v)));
  return data;
};

for (const storage of ['local', 'postgres']) {
  describe(`Evidencias multimedia · almacenamiento ${storage}`, () => {
    let srv;
    let db;
    let coord;
    let incidentId;

    before(async () => {
      const ctx = await setup();
      db = ctx.db;
      incidentId = (await createIncident(db, await baseIncident(db), ctx.users.coordinador)).id;
      srv = await startServer(db, testConfig({ storage }));
      coord = srv.client();
      await coord.login(EMAILS.coordinador);
    });
    after(() => srv.close());

    test('carga, lista, muestra y verifica la integridad de una imagen', async () => {
      const up = await coord.call(`/incidentes/${incidentId}/evidencias`, { method: 'POST', form: form(PNG, 'captura nota de rescate.png', { descripcion: 'Pantalla del servidor de facturación' }) });
      assert.equal(up.status, 201, JSON.stringify(up.body));
      assert.equal(up.body.categoria, 'imagen');
      assert.equal(up.body.tipo_mime, 'image/png');
      assert.equal(up.body.sha256, createHash('sha256').update(PNG).digest('hex'));
      assert.equal(up.body.clave_almacenamiento, undefined, 'no expone datos internos');

      const list = await coord.call(`/incidentes/${incidentId}/evidencias`);
      assert.equal(list.body.length, 1);

      const content = await coord.call(`/evidencias/${up.body.id}/contenido`, { raw: true });
      assert.equal(content.status, 200);
      assert.equal(content.headers.get('content-type'), 'image/png');
      assert.equal(content.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(Buffer.from(await content.arrayBuffer()), PNG);

      const download = await coord.call(`/evidencias/${up.body.id}/contenido?descargar=1`, { raw: true });
      assert.match(download.headers.get('content-disposition'), /^attachment; filename="captura nota de rescate.png"; filename\*=UTF-8''/);

      const check = await coord.call(`/evidencias/${up.body.id}/verificar`);
      assert.equal(check.body.integra, true);

      const history = await db.many(`SELECT evento FROM historial_recuperacion WHERE incidente_id = $1`, [incidentId]);
      assert.ok(history.some((h) => h.evento === 'evidencia_registrada'));
    });

    test('acepta PDF y registros de texto; detecta el tipo por el contenido', async () => {
      const pdf = await coord.call(`/incidentes/${incidentId}/evidencias`, { method: 'POST', form: form(PDF, 'informe-forense.pdf') });
      assert.equal(pdf.body.categoria, 'documento');
      const log = await coord.call(`/incidentes/${incidentId}/evidencias`, { method: 'POST', form: form(LOG, 'edr.log') });
      assert.equal(log.body.categoria, 'registro');
      assert.equal(log.body.tipo_mime, 'text/plain');
    });

    test('rechaza ejecutables, archivos disfrazados y duplicados', async () => {
      const exe = await coord.call(`/incidentes/${incidentId}/evidencias`, { method: 'POST', form: form(EXE, 'reporte.pdf') });
      assert.equal(exe.status, 400);
      const fake = await coord.call(`/incidentes/${incidentId}/evidencias`, { method: 'POST', form: form(HTML_AS_PNG, 'foto.png') });
      assert.equal(fake.status, 400, 'la extensión .png no basta: el contenido es HTML');
      const dup = await coord.call(`/incidentes/${incidentId}/evidencias`, { method: 'POST', form: form(PNG, 'otra-copia.png') });
      assert.equal(dup.status, 409);
    });

    test('rechaza archivos más grandes que el límite', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024 + 10)]);
      const res = await coord.call(`/incidentes/${incidentId}/evidencias`, { method: 'POST', form: form(big, 'grande.png') });
      assert.equal(res.status, 413);
    });

    test('solo los participantes cargan evidencias y solo coordinador o autor anulan', async () => {
      const legal = srv.client();
      await legal.login(EMAILS.legal);
      const denied = await legal.call(`/incidentes/${incidentId}/evidencias`, { method: 'POST', form: form(Buffer.from('nota legal\n'), 'nota.txt') });
      assert.equal(denied.status, 403);

      const analyst = srv.client();
      await analyst.login(EMAILS.analistaTi); // tiene la acción de detección asignada
      const own = await analyst.call(`/incidentes/${incidentId}/evidencias`, { method: 'POST', form: form(Buffer.from('hash de muestra\n'), 'muestra.txt') });
      assert.equal(own.status, 201);

      assert.equal((await legal.call(`/evidencias/${own.body.id}/anular`, { method: 'POST', body: { motivo: 'No corresponde al caso' } })).status, 403);
      assert.equal((await analyst.call(`/evidencias/${own.body.id}/anular`, { method: 'POST', body: { motivo: 'corto' } })).status, 400);
      const voided = await analyst.call(`/evidencias/${own.body.id}/anular`, { method: 'POST', body: { motivo: 'Archivo cargado por error en este incidente' } });
      assert.equal(voided.body.anulada, true);

      const library = await coord.call('/evidencias');
      assert.ok(!library.body.evidencias.some((e) => e.id === own.body.id), 'las anuladas se ocultan por defecto');
      const all = await coord.call('/evidencias?incluirAnuladas=true');
      assert.ok(all.body.evidencias.some((e) => e.id === own.body.id));
      assert.ok(all.body.totales.some((t) => t.categoria === 'imagen'));
    });
  });
}
