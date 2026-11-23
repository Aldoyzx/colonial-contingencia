import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, LOCATIONS, RACKS, RACK_UNITS } from '../src/db/seedData.js';
import { BusinessRuleError, ForbiddenError } from '../src/domain/errors.js';
import { assessRisk, heatLevel } from '../src/domain/risk.js';
import { getAsset, getDataCenterMap, getPipelineMap, isolateAsset, releaseAsset } from '../src/services/assetService.js';
import { recordHistory } from '../src/services/historyService.js';
import { verifyLedger } from '../src/services/ledgerService.js';
import { advanceIncident, createIncident, decideIncident } from '../src/services/incidentService.js';
import { closeRound, recordCheck, startRound } from '../src/services/roundService.js';
import { baseIncident, closeStageActions, setup } from './helpers.js';
import { EMAILS, startServer } from './httpHelpers.js';

const assetId = async (db, codigo) => (await db.one('SELECT id FROM activos WHERE codigo = $1', [codigo])).id;
const isolatedCodes = async (db) => (await db.many('SELECT codigo FROM activos WHERE aislado ORDER BY codigo')).map((r) => r.codigo);

/** Incidente registrado y llevado hasta D1 = Sí (red OT detenida). */
async function incidentWithOtStopped(db, users) {
  let detail = await createIncident(db, await baseIncident(db), users.coordinador);
  await closeStageActions(db, detail, users.coordinador);
  detail = await advanceIncident(db, detail.id, {}, users.coordinador);
  await closeStageActions(db, detail, users.coordinador);
  return decideIncident(db, detail.id, { respuesta: true, justificacion: 'Riesgo de propagación a SCADA' }, users.coordinador);
}

describe('Inventario de sistemas e instalaciones', () => {
  test('cada activo cabe en su rack, no se solapa con otro y está en la ubicación del rack', () => {
    const rackOf = Object.fromEntries(RACKS.map((r) => [r.codigo, r]));
    for (const a of ASSETS) {
      assert.ok(rackOf[a.rack], `${a.codigo}: rack ${a.rack} no existe`);
      assert.equal(a.ubicacion, rackOf[a.rack].ubicacion, `${a.codigo} está en otra ubicación que su rack`);
      assert.ok(a.u >= 1 && a.u + a.alto - 1 <= RACK_UNITS, `${a.codigo} se sale del rack`);
    }
    for (const rack of RACKS) {
      const used = new Map();
      ASSETS.filter((a) => a.rack === rack.codigo).forEach((a) => {
        for (let u = a.u; u < a.u + a.alto; u += 1) {
          assert.ok(!used.has(u), `${a.codigo} y ${used.get(u)} ocupan la U${u} de ${rack.codigo}`);
          used.set(u, a.codigo);
        }
      });
    }
  });

  test('la base tiene las instalaciones reales de la red y los activos de referencia', async () => {
    const { db } = await setup();
    const { total } = await db.one('SELECT count(*) AS total FROM activos');
    assert.equal(total, ASSETS.length);
    const line = await db.many('SELECT codigo FROM ubicaciones WHERE km_aprox IS NOT NULL ORDER BY km_aprox');
    assert.deepEqual(line.map((l) => l.codigo), LOCATIONS.filter((l) => l.km !== null).map((l) => l.codigo));
    assert.equal(line[0].codigo, 'HOU');
    assert.equal(line.at(-1).codigo, 'LIN');
  });
});

describe('Riesgo y escala de calor', () => {
  test('la escala tiene 6 niveles como el mapa de calor del rack', () => {
    assert.deepEqual([0, 0.01, 0.2, 0.21, 0.6, 0.8, 0.81, 1].map(heatLevel), [0, 1, 1, 2, 3, 4, 5, 5]);
  });

  test('la VPN heredada ya era riesgo alto antes del ataque y queda en rojo al caer su servicio', () => {
    const vpn = { criticidad: 3, expuesto_internet: true, sin_mfa: true, sin_soporte: true, privilegiado: false, aislado: false };
    const normal = assessRisk(vpn, 'operativo');
    assert.equal(normal.puntaje, 0.7);
    assert.equal(normal.nivel, 4);
    assert.equal(assessRisk(vpn, 'afectado').nivel, 5);
    const isolated = assessRisk({ ...vpn, aislado: true }, 'afectado');
    assert.ok(isolated.puntaje < 0.8, 'aislarlo elimina su exposición');
    assert.ok(!isolated.factores.some((f) => f.clave === 'expuesto' || f.clave === 'sinMfa'));
  });
});

describe('Aislamiento automático en rojo', () => {
  test('al registrar el incidente se aíslan solo los activos que quedan en rojo', async () => {
    const { db, users } = await setup();
    const detail = await createIncident(db, await baseIncident(db), users.coordinador);
    assert.deepEqual(await isolatedCodes(db), ['VPN-GW01', 'VPN-LEGADO']);
    const vpn = await getAsset(db, await assetId(db, 'VPN-LEGADO'));
    assert.match(vpn.aislado_motivo, /^Aislamiento automático: riesgo 100% al quedar afectado TI-VPN/);
    const events = await db.many(`SELECT evento FROM historial_recuperacion WHERE incidente_id = $1 AND evento = 'activo_aislado'`, [detail.id]);
    assert.equal(events.length, 2);
  });

  test('D1 = Sí aísla los servidores SCADA y la estación de ingeniería, no toda la red OT', async () => {
    const { db, users } = await setup();
    await incidentWithOtStopped(db, users);
    const isolated = await isolatedCodes(db);
    for (const code of ['SCD-P01', 'SCD-S01', 'ENG-WS01']) assert.ok(isolated.includes(code), `${code} debe quedar aislado`);
    for (const code of ['OT-FW01', 'HIS-PI01', 'RTU-T1']) assert.ok(!isolated.includes(code), `${code} no llega a rojo`);
  });
});

describe('Aislamiento manual y reconexión', () => {
  test('cada rol solo aísla activos de su red', async () => {
    const { db, users } = await setup();
    const scada = await assetId(db, 'HIS-PI01');
    await assert.rejects(isolateAsset(db, scada, { motivo: 'Tráfico anómalo hacia el historian' }, users.legal), ForbiddenError);
    await assert.rejects(isolateAsset(db, scada, { motivo: 'Tráfico anómalo hacia el historian' }, users.analistaTi), ForbiddenError);
    const result = await isolateAsset(db, scada, { motivo: 'Tráfico anómalo hacia el historian' }, users.operadorOt);
    assert.equal(result.aislado, true);
    assert.equal(result.aislado_por_nombre, 'Lucía Paredes');
    await assert.rejects(isolateAsset(db, scada, { motivo: 'Segundo intento de aislamiento' }, users.operadorOt), BusinessRuleError);
  });

  test('no se reconecta sin una verificación OK posterior al aislamiento', async () => {
    const { db, users } = await setup();
    await createIncident(db, await baseIncident(db), users.coordinador);
    const vpn = await assetId(db, 'VPN-LEGADO');
    await assert.rejects(releaseAsset(db, vpn, {}, users.analistaTi), /ronda de verificación/);

    let round = await startRound(db, { alcance: 'aislados' }, users.analistaTi);
    assert.equal(round.items.length, 2);
    round = await recordCheck(db, round.id, vpn, { resultado: 'falla', nota: 'La cuenta heredada sigue habilitada' }, users.analistaTi);
    await assert.rejects(releaseAsset(db, vpn, {}, users.analistaTi), /ronda de verificación/);

    await recordCheck(db, round.id, vpn, { resultado: 'ok' }, users.analistaTi);
    const released = await releaseAsset(db, vpn, { nota: 'Cuenta eliminada; acceso solo por el gateway con MFA' }, users.analistaTi);
    assert.equal(released.aislado, false);
    assert.equal(released.historial[0].evento, 'activo_liberado');
  });
});

describe('Rondas de verificación', () => {
  test('una ronda no se cierra con activos pendientes y registra el resumen', async () => {
    const { db, users } = await setup();
    const round = await startRound(db, { alcance: 'rack', valor: 'A02' }, users.analistaTi);
    assert.equal(round.items.length, 5);
    await assert.rejects(closeRound(db, round.id, users.analistaTi), /Faltan 5 activo/);

    for (const item of round.items) {
      const resultado = item.codigo === 'MAIL-EX01' ? 'observado' : 'ok';
      await recordCheck(db, round.id, item.activo_id, { resultado, nota: resultado === 'ok' ? undefined : 'Parche pendiente en Exchange' }, users.analistaTi);
    }
    await assert.rejects(closeRound(db, round.id, users.operadorOt), /Solo quien inició la ronda/);
    const closed = await closeRound(db, round.id, users.analistaTi);
    assert.ok(closed.cerrada_en);
    assert.equal(closed.ok, 4);
    assert.equal(closed.observados, 1);
    await assert.rejects(recordCheck(db, round.id, round.items[0].activo_id, { resultado: 'ok' }, users.analistaTi), /ya está cerrada/);
  });

  test('cada activo lo verifica el rol de su red y lo observado exige nota', async () => {
    const { db, users } = await setup();
    const round = await startRound(db, { alcance: 'servicio', valor: 'OT-SCADA' }, users.coordinador);
    const scada = round.items.find((i) => i.codigo === 'SCD-P01');
    await assert.rejects(recordCheck(db, round.id, scada.activo_id, { resultado: 'ok' }, users.analistaTi), ForbiddenError);
    await assert.rejects(recordCheck(db, round.id, scada.activo_id, { resultado: 'observado' }, users.operadorOt), /Explica/);
    await assert.rejects(startRound(db, { alcance: 'aislados' }, users.legal), ForbiddenError);
    await assert.rejects(startRound(db, { alcance: 'aislados' }, users.coordinador), /No hay activos aislados/);
  });
});

describe('Mapas de calor', () => {
  test('el mapa del centro de datos agrupa los activos por rack con su riesgo', async () => {
    const { db, users } = await setup();
    await incidentWithOtStopped(db, users);
    const map = await getDataCenterMap(db);
    assert.equal(map.racks.length, RACKS.length);
    assert.equal(map.racks.reduce((n, r) => n + r.activos.length, 0), ASSETS.length);
    assert.equal(map.resumen.aislados, 5);
    const legacy = map.racks.find((r) => r.codigo === 'A01').activos.find((a) => a.codigo === 'VPN-LEGADO');
    assert.equal(legacy.servicio_estado, 'afectado');
    assert.ok(legacy.riesgo.factores.length > 0);
  });

  test('el mapa del oleoducto ordena las instalaciones y pinta los tramos por estado', async () => {
    const { db, users } = await setup();
    let map = await getPipelineMap(db);
    assert.equal(map.instalaciones.length, 10);
    assert.equal(map.tramos.length, 9);
    assert.ok(map.tramos.every((t) => t.servicio_estado === 'operativo'));

    await incidentWithOtStopped(db, users);
    map = await getPipelineMap(db);
    assert.ok(map.tramos.every((t) => t.servicio_estado === 'afectado'));
    const control = map.centros.find((c) => c.codigo === 'ALP');
    assert.equal(control.aislados, 3);
  });
});

describe('Bitácora encadenada con SHA-256', () => {
  test('la cadena es íntegra después de un incidente completo de eventos', async () => {
    const { db, users } = await setup();
    await incidentWithOtStopped(db, users);
    const result = await verifyLedger(db);
    assert.equal(result.integra, true);
    assert.ok(result.total > 10);
    assert.match(result.ultimoHash, /^[0-9a-f]{64}$/);
  });

  test('detecta un evento modificado o borrado directamente en la base', async () => {
    const { db, users } = await setup();
    await incidentWithOtStopped(db, users);
    const target = await db.one('SELECT secuencia FROM historial_recuperacion ORDER BY secuencia OFFSET 3 LIMIT 1');

    await db.query('ALTER TABLE historial_recuperacion DISABLE TRIGGER trg_historial_inmutable');
    try {
      await db.query(`UPDATE historial_recuperacion SET detalle = 'alterado' WHERE secuencia = $1`, [target.secuencia]);
      let result = await verifyLedger(db);
      assert.equal(result.integra, false);
      assert.equal(result.primerError.secuencia, target.secuencia);
      assert.match(result.primerError.motivo, /modificado/);

      await db.query('DELETE FROM historial_recuperacion WHERE secuencia = $1', [target.secuencia]);
      result = await verifyLedger(db);
      assert.equal(result.integra, false);
      assert.match(result.primerError.motivo, /Falta el evento/);
    } finally {
      await db.query('ALTER TABLE historial_recuperacion ENABLE TRIGGER trg_historial_inmutable');
    }
  });

  test('las inserciones concurrentes quedan en una sola cadena sin huecos', async () => {
    const { db, users } = await setup();
    await Promise.all(Array.from({ length: 12 }, (_, i) =>
      db.tx((tx) => recordHistory(tx, { evento: 'prueba_concurrencia', detalle: `Evento ${i}`, usuarioId: users.coordinador.id }))));
    const result = await verifyLedger(db);
    assert.equal(result.integra, true);
    assert.equal(result.total, 12);
  });
});

describe('API de mapas, rondas y bitácora', () => {
  let ctx;
  before(async () => {
    const { db } = await setup();
    ctx = await startServer(db);
  });
  after(() => ctx.close());

  test('exige sesión', async () => {
    const anon = ctx.client();
    assert.equal((await anon.call('/mapas/centro-datos')).status, 401);
    assert.equal((await anon.call('/bitacora/verificar')).status, 401);
  });

  test('aislar, verificar en ronda y reconectar por HTTP', async () => {
    const ti = ctx.client();
    await ti.login(EMAILS.analistaTi);
    const map = await ti.call('/mapas/centro-datos');
    assert.equal(map.status, 200);
    const mail = map.body.racks.flatMap((r) => r.activos).find((a) => a.codigo === 'MAIL-EX01');

    assert.equal((await ti.call(`/activos/${mail.id}/aislar`, { method: 'POST', body: { motivo: 'corto' } })).status, 400);
    const iso = await ti.call(`/activos/${mail.id}/aislar`, { method: 'POST', body: { motivo: 'Reglas de reenvío sospechosas en buzones' } });
    assert.equal(iso.status, 200);
    assert.equal((await ti.call(`/activos/${mail.id}/liberar`, { method: 'POST', body: {} })).status, 409);

    const round = await ti.call('/rondas', { method: 'POST', body: { alcance: 'aislados' } });
    assert.equal(round.status, 201);
    assert.equal((await ti.call('/rondas', { method: 'POST', body: { alcance: 'rack', valor: 'Z' } })).status, 400);
    assert.equal((await ti.call(`/rondas/${round.body.id}/activos/${mail.id}`, { method: 'PATCH', body: { resultado: 'falla' } })).status, 400);
    assert.equal((await ti.call(`/rondas/${round.body.id}/activos/${mail.id}`, { method: 'PATCH', body: { resultado: 'ok' } })).status, 200);
    assert.equal((await ti.call(`/rondas/${round.body.id}/cerrar`, { method: 'POST' })).status, 200);
    const released = await ti.call(`/activos/${mail.id}/liberar`, { method: 'POST', body: { nota: 'Reglas eliminadas' } });
    assert.equal(released.status, 200);
    assert.equal(released.body.aislado, false);

    const ledger = await ti.call('/bitacora/verificar');
    assert.equal(ledger.body.integra, true);
    const recent = await ti.call('/bitacora?limite=3');
    assert.equal(recent.body.length, 3);
    assert.equal(recent.body[0].evento, 'activo_liberado');
  });

  test('el mapa del oleoducto responde con instalaciones y tramos', async () => {
    const ot = ctx.client();
    await ot.login(EMAILS.operadorOt);
    const res = await ot.call('/mapas/oleoducto');
    assert.equal(res.status, 200);
    assert.equal(res.body.instalaciones[0].ciudad, 'Pasadena');
  });
});
