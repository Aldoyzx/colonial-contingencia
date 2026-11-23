import { RACKS, RACK_UNITS } from '../db/seedData.js';
import { BusinessRuleError, NotFoundError } from '../domain/errors.js';
import { assertCanOperateAsset } from '../domain/permissions.js';
import { ISOLATION_THRESHOLD, assessRisk } from '../domain/risk.js';
import { recordHistory } from './historyService.js';

const ASSET_SELECT = `
  SELECT a.*, s.codigo AS servicio_codigo, s.nombre AS servicio_nombre, s.estado AS servicio_estado,
         ub.codigo AS ubicacion_codigo, ub.nombre AS ubicacion_nombre, ub.ciudad AS ubicacion_ciudad,
         ua.nombre AS aislado_por_nombre,
         v.resultado AS verificacion_resultado, v.verificado_en, v.nota AS verificacion_nota, v.verificado_por AS verificado_por_nombre
    FROM activos a
    JOIN ubicaciones ub ON ub.id = a.ubicacion_id
    LEFT JOIN servicios s ON s.id = a.servicio_id
    LEFT JOIN usuarios ua ON ua.id = a.aislado_por
    LEFT JOIN v_ultima_verificacion v ON v.activo_id = a.id`;

/** Activo con su riesgo y si ya puede liberarse (verificación OK posterior al aislamiento). */
function decorate(asset) {
  const riesgo = assessRisk(asset, asset.servicio_estado ?? null);
  const verificadoTrasAislar = Boolean(
    asset.aislado && asset.verificacion_resultado === 'ok' && new Date(asset.verificado_en) > new Date(asset.aislado_en)
  );
  return { ...asset, riesgo, puedeLiberarse: verificadoTrasAislar };
}

async function getAssetRow(db, assetId, { forUpdate = false } = {}) {
  const asset = await db.one(
    forUpdate ? 'SELECT * FROM activos WHERE id = $1 FOR UPDATE' : `${ASSET_SELECT} WHERE a.id = $1`,
    [assetId]
  );
  if (!asset) throw new NotFoundError('Activo', assetId);
  return asset;
}

export async function getAsset(db, assetId) {
  const asset = decorate(await getAssetRow(db, assetId));
  const historial = await db.many(
    `SELECT h.id, h.evento, h.estado_anterior, h.estado_nuevo, h.detalle, h.fecha, u.nombre AS usuario_nombre
       FROM historial_recuperacion h JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.activo_id = $1 ORDER BY h.secuencia DESC LIMIT 20`,
    [assetId]
  );
  return { ...asset, historial };
}

export async function listAssets(db) {
  return (await db.many(`${ASSET_SELECT} ORDER BY a.rack, a.u_inicio DESC`)).map(decorate);
}

// ------------------------------------------------------------------ aislamiento

async function isolate(db, asset, { motivo, usuarioId, incidenteId = null, evento }) {
  await db.run(
    `UPDATE activos SET aislado = TRUE, aislado_motivo = $2, aislado_por = $3, aislado_en = clock_timestamp(), actualizado_en = now()
      WHERE id = $1`,
    [asset.id, motivo, usuarioId]
  );
  await recordHistory(db, {
    incidenteId, activoId: asset.id, evento, estadoAnterior: 'conectado', estadoNuevo: 'aislado', detalle: `${asset.codigo}: ${motivo}`, usuarioId,
  });
}

/**
 * Regla traída del proyecto Rack (las posiciones con daño rojo se bloquean solas): cuando un
 * servicio pasa a "afectado", sus activos que quedan en rojo se aíslan automáticamente.
 * Los demás quedan en el mapa para que el equipo decida.
 * @returns {Promise<string[]>} códigos de los activos aislados.
 */
export async function isolateRedAssetsOfService(db, service, { usuarioId, incidenteId = null }) {
  const assets = await db.many('SELECT * FROM activos WHERE servicio_id = $1 AND NOT aislado ORDER BY id FOR UPDATE', [service.id]);
  const isolated = [];
  for (const asset of assets) {
    const { puntaje } = assessRisk(asset, 'afectado');
    if (puntaje < ISOLATION_THRESHOLD) continue;
    await isolate(db, asset, {
      motivo: `Aislamiento automático: riesgo ${Math.round(puntaje * 100)}% al quedar afectado ${service.codigo}`,
      usuarioId,
      incidenteId,
      evento: 'activo_aislado',
    });
    isolated.push(asset.codigo);
  }
  return isolated;
}

/** Incidente abierto más reciente del servicio del activo, para enlazar la bitácora. */
async function openIncidentFor(db, asset) {
  if (!asset.servicio_id) return null;
  const row = await db.one(
    `SELECT i.id FROM incidentes i JOIN incidente_servicios isv ON isv.incidente_id = i.id
      WHERE isv.servicio_id = $1 AND i.estado = 'abierto' ORDER BY i.id DESC LIMIT 1`,
    [asset.servicio_id]
  );
  return row?.id ?? null;
}

export function isolateAsset(db, assetId, { motivo }, user) {
  return db.tx(async (tx) => {
    const asset = await getAssetRow(tx, assetId, { forUpdate: true });
    assertCanOperateAsset(user, asset);
    if (asset.aislado) throw new BusinessRuleError(`${asset.codigo} ya está aislado`);
    await isolate(tx, asset, { motivo, usuarioId: user.id, incidenteId: await openIncidentFor(tx, asset), evento: 'activo_aislado' });
    return getAsset(tx, assetId);
  });
}

export function releaseAsset(db, assetId, { nota }, user) {
  return db.tx(async (tx) => {
    const asset = await getAssetRow(tx, assetId, { forUpdate: true });
    assertCanOperateAsset(user, asset);
    if (!asset.aislado) throw new BusinessRuleError(`${asset.codigo} no está aislado`);

    const verified = await tx.one(
      `SELECT 1 FROM ronda_items WHERE activo_id = $1 AND resultado = 'ok' AND verificado_en > $2 LIMIT 1`,
      [asset.id, asset.aislado_en]
    );
    if (!verified) {
      throw new BusinessRuleError(
        `No se puede reconectar ${asset.codigo}: primero debe pasar una ronda de verificación con resultado OK después de aislarlo`
      );
    }

    await tx.run(
      `UPDATE activos SET aislado = FALSE, aislado_motivo = NULL, aislado_por = NULL, aislado_en = NULL, actualizado_en = now()
        WHERE id = $1`,
      [asset.id]
    );
    await recordHistory(tx, {
      incidenteId: await openIncidentFor(tx, asset),
      activoId: asset.id,
      evento: 'activo_liberado',
      estadoAnterior: 'aislado',
      estadoNuevo: 'conectado',
      detalle: nota ? `${asset.codigo}: ${nota}` : `${asset.codigo}: reconectado tras verificación`,
      usuarioId: user.id,
    });
    return getAsset(tx, assetId);
  });
}

// ------------------------------------------------------------------ mapas de calor

function summarize(assets) {
  const porNivel = [0, 0, 0, 0, 0, 0];
  assets.forEach((a) => { porNivel[a.riesgo.nivel] += 1; });
  return {
    total: assets.length,
    aislados: assets.filter((a) => a.aislado).length,
    enRojo: porNivel[5],
    listosParaReconectar: assets.filter((a) => a.puedeLiberarse).length,
    sinVerificar: assets.filter((a) => !a.verificacion_resultado).length,
    porNivel,
  };
}

/** Mapa de calor del centro de datos y del centro de control: racks de 42 U con sus activos. */
export async function getDataCenterMap(db) {
  const assets = await listAssets(db);
  const locations = await db.many(`SELECT codigo, nombre, ciudad, estado_eeuu FROM ubicaciones WHERE tipo IN ('centro_datos', 'centro_control')`);
  const racks = RACKS.map((rack) => ({
    ...rack,
    unidades: RACK_UNITS,
    ubicacion: locations.find((l) => l.codigo === rack.ubicacion) ?? null,
    activos: assets.filter((a) => a.rack === rack.codigo),
  }));
  return { generadoEn: new Date().toISOString(), umbralAislamiento: ISOLATION_THRESHOLD, racks, resumen: summarize(assets) };
}

/** Mapa de la red del oleoducto: instalaciones ordenadas por distancia y tramos coloreados por estado. */
export async function getPipelineMap(db) {
  const [locations, assets] = await Promise.all([
    db.many(
      `SELECT u.*, s.codigo AS servicio_codigo, s.nombre AS servicio_nombre, s.estado AS servicio_estado,
              s.nota_estado AS servicio_nota, s.criticidad AS servicio_criticidad
         FROM ubicaciones u LEFT JOIN servicios s ON s.id = u.servicio_id
        ORDER BY u.km_aprox NULLS LAST, u.codigo`
    ),
    listAssets(db),
  ]);
  const line = locations.filter((l) => l.km_aprox !== null);
  const tramos = line.slice(1).map((destino, i) => ({
    desde: line[i].codigo,
    hasta: destino.codigo,
    servicio_codigo: destino.servicio_codigo,
    servicio_estado: destino.servicio_estado,
  }));
  const centros = locations
    .filter((l) => l.km_aprox === null)
    .map((c) => {
      const own = assets.filter((a) => a.ubicacion_codigo === c.codigo);
      return { ...c, activos: own.length, aislados: own.filter((a) => a.aislado).length, enRojo: own.filter((a) => a.riesgo.nivel === 5).length };
    });
  return { generadoEn: new Date().toISOString(), instalaciones: line, tramos, centros, longitudKm: line.at(-1)?.km_aprox ?? 0 };
}
