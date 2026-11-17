import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DECISIONS, STAGES } from '../src/domain/flow.js';
import { RESOURCES } from '../src/domain/resources.js';
import { createIncident } from '../src/services/incidentService.js';
import { baseIncident, setup } from './helpers.js';

/** Espera que la consulta falle con el código SQLSTATE indicado. */
async function assertSqlState(promise, code, message) {
  await assert.rejects(promise, (error) => error.code === code, message);
}

describe('Base de datos PostgreSQL', () => {
  test('el catálogo del plan coincide con flow.js y resources.js', async () => {
    const { db } = await setup();
    const etapas = await db.many('SELECT clave, siguiente, tipo FROM etapas ORDER BY orden');
    assert.deepEqual(etapas.map((e) => e.clave), Object.keys(STAGES));
    etapas.forEach((e) => assert.equal(e.siguiente, STAGES[e.clave].siguiente ?? null, `siguiente de ${e.clave}`));

    const decisiones = await db.many('SELECT codigo, destino_si, destino_no FROM decisiones_plan ORDER BY codigo');
    assert.deepEqual(decisiones.map((d) => d.codigo), Object.keys(DECISIONS));
    decisiones.forEach((d) => {
      assert.equal(d.destino_si, DECISIONS[d.codigo].si.destino);
      assert.equal(d.destino_no, DECISIONS[d.codigo].no.destino);
    });

    const { total } = await db.one('SELECT COUNT(*) AS total FROM recursos_tecnologicos');
    assert.equal(total, RESOURCES.length);
    const sinRecursos = await db.many(
      `SELECT e.clave FROM etapas e WHERE e.tipo <> 'final'
        AND NOT EXISTS (SELECT 1 FROM etapa_recursos er WHERE er.etapa = e.clave)`
    );
    assert.deepEqual(sinRecursos, [], 'toda etapa operativa tiene recursos asignados');
  });

  test('las restricciones CHECK rechazan datos inválidos', async () => {
    const { db } = await setup();
    await assertSqlState(
      db.query(`INSERT INTO servicios (codigo, nombre, tipo, criticidad) VALUES ('OT-X', 'Prueba', 'OT', 6)`),
      '23514', 'criticidad fuera de 1–5'
    );
    await assertSqlState(
      db.query(`INSERT INTO servicios (codigo, nombre, tipo, criticidad) VALUES ('TI-X', 'Prueba', 'OT', 3)`),
      '23514', 'el prefijo del código debe coincidir con el tipo'
    );
    await assertSqlState(
      db.query(`INSERT INTO usuarios (nombre, email, rol) VALUES ('X', 'NoEsCorreo', 'legal')`),
      '23514', 'correo con formato inválido'
    );
    await assertSqlState(
      db.query(`INSERT INTO usuarios (nombre, email, rol) VALUES ('X', 'x@colonial.local', 'gerente')`),
      '22P02', 'rol fuera del ENUM'
    );
  });

  test('las claves foráneas y los índices únicos protegen la integridad', async () => {
    const { db, users } = await setup();
    const incident = await createIncident(db, await baseIncident(db), users.coordinador);

    await assertSqlState(
      db.query(`UPDATE incidentes SET etapa = 'etapa_inexistente' WHERE id = $1`, [incident.id]),
      '23503', 'la etapa debe existir en el catálogo'
    );
    await assertSqlState(
      db.query(`UPDATE incidentes SET estado = 'cerrado' WHERE id = $1`, [incident.id]),
      '23514', 'no se puede cerrar sin fecha, etapa final ni lecciones aprendidas'
    );

    const insertD1 = () => db.query(
      `INSERT INTO decisiones (incidente_id, codigo, pregunta, respuesta, justificacion, etapa_origen, etapa_destino, usuario_id)
       VALUES ($1, 'D1', 'P', TRUE, 'Prueba de unicidad', 'evaluacion', 'contencion', 1)`,
      [incident.id]
    );
    await insertD1();
    await assertSqlState(insertD1(), '23505', 'D1 se toma una sola vez por incidente');

    await assertSqlState(
      db.query(`DELETE FROM servicios WHERE codigo = 'TI-FACT'`),
      '23503', 'no se borra un servicio vinculado a un incidente'
    );
  });

  test('las vistas de reporte responden', async () => {
    const { db, users } = await setup();
    await createIncident(db, await baseIncident(db), users.coordinador);
    const resumen = await db.many('SELECT * FROM v_resumen_servicios ORDER BY tipo');
    assert.equal(resumen.length, 2);
    assert.equal(resumen.find((r) => r.tipo === 'TI').afectados, 3);
    const [incidente] = await db.many('SELECT * FROM v_incidentes_resumen');
    assert.equal(incidente.servicios_afectados, 3);
    assert.equal(incidente.etapa, 'Detección');
    const plan = await db.many('SELECT * FROM v_plan_contingencia');
    assert.equal(plan.length, Object.values(STAGES).filter((s) => s.tipo !== 'final').length);
  });
});
