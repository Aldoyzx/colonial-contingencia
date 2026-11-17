import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BusinessRuleError, ForbiddenError, ValidationError } from '../src/domain/errors.js';
import { updateAction } from '../src/services/actionService.js';
import { advanceIncident, createIncident, decideIncident, getIncidentDetail } from '../src/services/incidentService.js';
import { changeServiceStatus } from '../src/services/serviceStatusService.js';
import { baseIncident, closeStageActions, serviceByCode, setup } from './helpers.js';

const decide = (db, id, respuesta, user, justificacion = 'Decisión del comité de crisis') =>
  decideIncident(db, id, { respuesta, justificacion }, user);

/** Lleva un incidente nuevo hasta la etapa de erradicación (D1 Sí, D2 No como en el caso real). */
function reachEradication(db, users) {
  const { coordinador } = users;
  let detail = createIncident(db, baseIncident(db), coordinador);
  closeStageActions(db, detail, coordinador);
  detail = advanceIncident(db, detail.id, {}, coordinador);
  closeStageActions(db, detail, coordinador);
  detail = decide(db, detail.id, true, coordinador);
  closeStageActions(db, detail, coordinador);
  detail = decide(db, detail.id, false, coordinador, 'Respaldos comprometidos; se evalúa descifrado');
  return detail;
}

describe('Escenario 1: incidente inicial', () => {
  test('registra el incidente, marca servicios afectados y detiene la red OT en D1 = Sí', () => {
    const { db, users } = setup();
    const { coordinador } = users;

    let detail = createIncident(db, baseIncident(db), coordinador);
    assert.match(detail.codigo, /^INC-\d{4}-0001$/);
    assert.equal(detail.etapa, 'deteccion');
    assert.equal(detail.estado, 'abierto');
    assert.equal(serviceByCode(db, 'TI-FACT').estado, 'afectado');
    assert.equal(serviceByCode(db, 'OT-T1').estado, 'operativo');
    assert.equal(detail.acciones.length, 1);

    assert.throws(() => advanceIncident(db, detail.id, {}, coordinador), BusinessRuleError,
      'no debe avanzar con acciones pendientes');

    closeStageActions(db, detail, coordinador);
    detail = advanceIncident(db, detail.id, {}, coordinador);
    assert.equal(detail.etapa, 'evaluacion');
    assert.equal(detail.siguientePaso.codigo, 'D1');

    closeStageActions(db, detail, coordinador);
    detail = decide(db, detail.id, true, coordinador, 'Riesgo de propagación a SCADA');
    assert.equal(detail.etapa, 'contencion');
    assert.equal(detail.decisiones.length, 1);
    assert.equal(detail.decisiones[0].respuesta, true);

    const tramo1 = serviceByCode(db, 'OT-T1');
    assert.equal(tramo1.estado, 'afectado');
    assert.match(tramo1.nota_estado, /Detenido preventivamente/);
    assert.ok(detail.servicios.some((s) => s.codigo === 'OT-SCADA'), 'los servicios OT quedan vinculados');
    assert.ok(detail.acciones.some((a) => a.descripcion.startsWith('Detener preventivamente')));
  });
});

describe('Escenario 2: recuperación exitosa', () => {
  test('recorre el flujo completo hasta el cierre y restablece todos los servicios', () => {
    const { db, users } = setup();
    const { coordinador } = users;

    let detail = reachEradication(db, users);
    assert.equal(detail.etapa, 'erradicacion');

    closeStageActions(db, detail, coordinador);
    detail = decide(db, detail.id, true, coordinador, 'Validación de seguridad aprobada');
    assert.equal(detail.etapa, 'recuperacion');
    assert.equal(serviceByCode(db, 'OT-T2').estado, 'en_recuperacion');
    assert.equal(serviceByCode(db, 'TI-FACT').estado, 'en_recuperacion');

    closeStageActions(db, detail, coordinador);
    detail = decide(db, detail.id, true, coordinador, 'Escasez reportada en el sureste');
    assert.equal(detail.etapa, 'ruta_alternativa');

    closeStageActions(db, detail, coordinador);
    detail = advanceIncident(db, detail.id, {}, coordinador);
    assert.equal(detail.etapa, 'servicio_restablecido');
    detail.servicios.forEach((s) => assert.equal(s.estado, 'operativo', `${s.codigo} debe estar operativo`));

    closeStageActions(db, detail, coordinador);
    detail = advanceIncident(db, detail.id, {}, coordinador);
    assert.equal(detail.etapa, 'cierre');

    closeStageActions(db, detail, coordinador);
    assert.throws(() => advanceIncident(db, detail.id, {}, coordinador), ValidationError,
      'el cierre exige lecciones aprendidas');

    detail = advanceIncident(db, detail.id, {
      leccionesAprendidas: 'Exigir MFA en VPN, segmentar TI/OT y ensayar el plan de continuidad cada trimestre.',
    }, coordinador);
    assert.equal(detail.etapa, 'finalizado');
    assert.equal(detail.estado, 'cerrado');
    assert.ok(detail.cerrado_en);
    assert.equal(detail.decisiones.length, 4);
    assert.deepEqual(detail.decisiones.map((d) => d.codigo), ['D1', 'D2', 'D3', 'D4']);
    assert.ok(detail.historial.some((h) => h.evento === 'incidente_cerrado'));
  });
});

describe('Escenario 3: recuperación fallida', () => {
  test('una erradicación fallida obliga a ir a análisis forense y reintentar', () => {
    const { db, users } = setup();
    const { coordinador } = users;

    let detail = reachEradication(db, users);
    const pendingInStage = detail.acciones.filter((a) => a.etapa === 'erradicacion');
    const eradication = pendingInStage.find((a) => a.origen === 'entrada:erradicacion');
    const legalReview = pendingInStage.find((a) => a.origen === 'D2:no');
    assert.ok(eradication && legalReview, 'la etapa tiene la acción de erradicación y la de la rama D2 = No');

    // Regresión: la acción de la rama D2 se crea después; aunque se complete, la falla de erradicación debe bloquear D3 = Sí.
    updateAction(db, eradication.id, { estado: 'fallida', resultado: 'Persistencia detectada en el controlador de dominio' }, coordinador);
    updateAction(db, legalReview.id, { estado: 'completada', resultado: 'No se paga rescate adicional' }, coordinador);

    assert.throws(() => decide(db, detail.id, true, coordinador), BusinessRuleError,
      'no se puede validar el reinicio si la erradicación falló');

    detail = decide(db, detail.id, false, coordinador, 'Persisten indicadores de compromiso');
    assert.equal(detail.etapa, 'analisis_forense');
    assert.equal(detail.intentos_erradicacion, 1);
    assert.equal(serviceByCode(db, 'OT-T1').estado, 'afectado', 'los servicios siguen afectados');

    closeStageActions(db, detail, coordinador);
    detail = advanceIncident(db, detail.id, {}, coordinador);
    assert.equal(detail.etapa, 'erradicacion', 'la ruta Reintentar vuelve a erradicación');
    const eradicationAttempts = detail.acciones.filter((a) => a.origen === 'entrada:erradicacion');
    assert.equal(eradicationAttempts.length, 2, 'el reintento crea una nueva acción de erradicación');

    closeStageActions(db, detail, coordinador);
    detail = decide(db, detail.id, true, coordinador, 'Segundo barrido limpio');
    assert.equal(detail.etapa, 'recuperacion');
  });

  test('tres validaciones fallidas escalan la severidad a crítica', () => {
    const { db, users } = setup();
    const { coordinador } = users;

    let detail = reachEradication(db, users);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      closeStageActions(db, detail, coordinador, { estado: 'fallida', resultado: `Intento ${attempt} fallido` });
      detail = decide(db, detail.id, false, coordinador, `Fallo ${attempt}`);
      closeStageActions(db, detail, coordinador);
      detail = advanceIncident(db, detail.id, {}, coordinador);
    }
    assert.equal(detail.intentos_erradicacion, 3);
    assert.equal(detail.severidad, 'critica');
    assert.ok(detail.historial.some((h) => h.evento === 'escalamiento'));
  });

  test('un servicio en recuperación puede volver a afectado si el reinicio falla', () => {
    const { db, users } = setup();
    const { coordinador, operadorOt, analistaTi } = users;

    let detail = reachEradication(db, users);
    closeStageActions(db, detail, coordinador);
    detail = decide(db, detail.id, true, coordinador);

    const tramo3 = serviceByCode(db, 'OT-T3');
    assert.throws(() => changeServiceStatus(db, tramo3.id, { estado: 'afectado' }, analistaTi), ForbiddenError,
      'un analista TI no opera servicios OT');

    const updated = changeServiceStatus(db, tramo3.id, { estado: 'afectado', nota: 'Fuga de presión al reiniciar' }, operadorOt);
    assert.equal(updated.estado, 'afectado');
    assert.equal(updated.nota_estado, 'Fuga de presión al reiniciar');

    assert.throws(() => changeServiceStatus(db, tramo3.id, { estado: 'operativo' }, operadorOt), BusinessRuleError,
      'afectado → operativo exige pasar por recuperación');
  });
});

describe('Reglas de negocio', () => {
  test('solo el coordinador decide', () => {
    const { db, users } = setup();
    let detail = createIncident(db, baseIncident(db), users.coordinador);
    closeStageActions(db, detail, users.coordinador);
    detail = advanceIncident(db, detail.id, {}, users.coordinador);
    closeStageActions(db, detail, users.coordinador);
    assert.throws(() => decide(db, detail.id, true, users.analistaTi), ForbiddenError);
  });

  test('no se puede avanzar sin decidir en una etapa de decisión', () => {
    const { db, users } = setup();
    let detail = createIncident(db, baseIncident(db), users.coordinador);
    closeStageActions(db, detail, users.coordinador);
    detail = advanceIncident(db, detail.id, {}, users.coordinador);
    assert.throws(() => advanceIncident(db, detail.id, {}, users.coordinador), BusinessRuleError);
  });

  test('una acción fallida exige explicar el motivo y las acciones cerradas son inmutables', () => {
    const { db, users } = setup();
    const detail = createIncident(db, baseIncident(db), users.coordinador);
    const action = detail.acciones[0];
    assert.throws(() => updateAction(db, action.id, { estado: 'fallida' }, users.coordinador), ValidationError);
    updateAction(db, action.id, { estado: 'completada', resultado: 'OK' }, users.coordinador);
    assert.throws(() => updateAction(db, action.id, { estado: 'en_progreso' }, users.coordinador), BusinessRuleError);
  });

  test('un usuario ajeno a la acción no puede actualizarla', () => {
    const { db, users } = setup();
    const detail = createIncident(db, baseIncident(db), users.coordinador);
    // La acción de detección se asigna automáticamente al analista TI.
    assert.equal(detail.acciones[0].responsable_rol, 'analista_ti');
    assert.throws(() => updateAction(db, detail.acciones[0].id, { estado: 'en_progreso' }, users.legal), ForbiddenError);
    updateAction(db, detail.acciones[0].id, { estado: 'en_progreso' }, users.analistaTi);
    assert.equal(getIncidentDetail(db, detail.id).acciones[0].estado, 'en_progreso');
  });
});
