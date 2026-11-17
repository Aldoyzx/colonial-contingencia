import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SQL_FILES } from '../src/db/files.js';
import { getAnalytics, incidentsCsv } from '../src/services/analyticsService.js';
import { createIncident } from '../src/services/incidentService.js';
import { setup } from './helpers.js';
import { EMAILS, startServer } from './httpHelpers.js';

describe('Analítica de negocio', () => {
  let db;
  let srv;

  before(async () => {
    const ctx = await setup();
    db = ctx.db;
    await db.query(await readFile(SQL_FILES.demo, 'utf8')); // incidentes históricos de prueba
    srv = await startServer(db);
  });
  after(() => srv.close());

  test('calcula los indicadores a partir de los datos históricos', async () => {
    const data = await getAnalytics(db, { includeSecurity: true });
    assert.ok(data.resumen.incidentes_reales >= 1);
    assert.ok(data.resumen.mttr_horas > 0, 'tiempo medio de resolución');
    assert.ok(data.resumen.mttc_horas >= 0, 'tiempo medio hasta la contención');
    assert.equal(data.porSeveridad.length, 4, 'las 4 severidades aunque alguna tenga 0');
    assert.ok(data.tiemposEtapa.some((t) => t.etapa === 'erradicacion' && t.horas_promedio > 0));
    assert.ok(data.decisiones.find((d) => d.codigo === 'D1').si >= 1);
    const tramo1 = data.indisponibilidad.find((s) => s.codigo === 'OT-T1');
    assert.ok(tramo1.horas > 100, `OT-T1 estuvo detenido más de 100 h en 2021 (${tramo1.horas})`);
    assert.ok(Array.isArray(data.seguridad));
  });

  test('los simulacros no alteran el tiempo medio de resolución', async () => {
    const before = (await getAnalytics(db)).resumen;
    const { users } = { users: { coordinador: { id: 1 } } };
    await createIncident(db, { titulo: 'Simulacro de prueba', descripcion: 'Ejercicio de práctica del plan.', severidad: 'baja', responsableId: 1, servicioIds: [9], esSimulacro: true }, users.coordinador);
    const afterDrill = (await getAnalytics(db)).resumen;
    assert.equal(afterDrill.mttr_horas, before.mttr_horas);
    assert.equal(afterDrill.simulacros, before.simulacros + 1);
  });

  test('exporta CSV para Excel sin inyección de fórmulas', async () => {
    await db.query(`UPDATE incidentes SET titulo = '=HYPERLINK("http://x")' WHERE id = (SELECT max(id) FROM incidentes)`);
    const csv = await incidentsCsv(db);
    assert.ok(csv.startsWith('﻿codigo;titulo;'));
    assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`), 'la celda que empieza con = se neutraliza');
  });

  test('la API restringe la sección de seguridad al coordinador', async () => {
    const analyst = srv.client();
    await analyst.login(EMAILS.analistaTi);
    assert.equal((await analyst.call('/analitica')).body.seguridad, null);
    const coord = srv.client();
    await coord.login(EMAILS.coordinador);
    const res = await coord.call('/analitica');
    assert.ok(Array.isArray(res.body.seguridad));
    const csv = await coord.call('/analitica/incidentes.csv', { raw: true });
    assert.match(csv.headers.get('content-disposition'), /incidentes\.csv/);
  });
});
