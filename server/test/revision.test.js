/**
 * Pruebas de regresión de los hallazgos de la revisión (Actividad 2).
 * Cada prueba falla con la versión anterior del sistema y pasa con la corrección.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createIncident, getIncidentDetail, listIncidents } from '../src/services/incidentService.js';
import { getContingencyPlan } from '../src/services/planService.js';
import { baseIncident, setup } from './helpers.js';

describe('Revisión · correcciones de la Actividad 2', () => {
  test('H1: la bitácora se ordena por fecha y no por orden de inserción', async () => {
    const { db, users } = await setup();
    const detail = await createIncident(db, await baseIncident(db), users.coordinador);
    // Un evento registrado tarde pero con fecha anterior (p. ej., carga manual de evidencia).
    await db.query(
      `INSERT INTO historial_recuperacion (incidente_id, evento, detalle, usuario_id, fecha)
       VALUES ($1, 'accion_asignada', 'Evento retroactivo', 1, now() - interval '1 day')`,
      [detail.id]
    );
    const { historial } = await getIncidentDetail(db, detail.id);
    assert.equal(historial.at(-1).detalle, 'Evento retroactivo', 'el evento más antiguo va al final');
    const fechas = historial.map((h) => new Date(h.fecha).getTime());
    assert.deepEqual(fechas, [...fechas].sort((a, b) => b - a));
  });

  test('H2: la bitácora de auditoría no se puede modificar ni borrar', async () => {
    const { db, users } = await setup();
    await createIncident(db, await baseIncident(db), users.coordinador);
    await assert.rejects(db.query(`UPDATE historial_recuperacion SET detalle = 'alterado'`), { code: '23001' });
    await assert.rejects(db.query(`DELETE FROM historial_recuperacion`), { code: '23001' });
  });

  test('H3: altas simultáneas reciben códigos de incidente distintos', async () => {
    const { db, users } = await setup();
    const data = await baseIncident(db);
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createIncident(db, { ...data, titulo: `Incidente simultáneo ${i + 1}` }, users.coordinador))
    );
    const codes = created.map((d) => d.codigo);
    assert.equal(new Set(codes).size, 5, `códigos repetidos: ${codes.join(', ')}`);
  });

  test('H6: el plan expone procedimiento, responsable y recursos de cada etapa', async () => {
    const { db } = await setup();
    const plan = await getContingencyPlan(db);
    assert.equal(plan.etapas.length, 9);
    plan.etapas.forEach((e) => {
      assert.ok(e.procedimiento, `${e.clave} sin procedimiento`);
      assert.ok(e.responsable_nombre, `${e.clave} sin persona responsable`);
      assert.ok(e.recursos.length > 0, `${e.clave} sin recursos`);
    });
    assert.equal(plan.etapas.find((e) => e.clave === 'erradicacion').decision.codigo, 'D3');
    assert.equal(plan.recursos.length, 15);
  });

  test('H7: un simulacro queda marcado y se distingue de un incidente real', async () => {
    const { db, users } = await setup();
    const data = await baseIncident(db);
    await createIncident(db, data, users.coordinador);
    const drill = await createIncident(db, { ...data, titulo: 'Simulacro trimestral', esSimulacro: true }, users.coordinador);
    assert.equal(drill.es_simulacro, true);
    assert.match(drill.historial.at(-1).detalle, /^\[SIMULACRO\]/);
    const list = await listIncidents(db);
    assert.deepEqual(list.map((i) => i.es_simulacro), [true, false]);
  });
});
