import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors.js';
import { ROLES } from '../domain/permissions.js';
import { recordHistory } from './historyService.js';

/**
 * Tipos aceptados según la FIRMA real del archivo (sus primeros bytes), no según la
 * extensión ni el Content-Type que envía el navegador, que el usuario puede falsear.
 * SVG y HTML se excluyen: pueden contener scripts.
 */
const BINARY_TYPES = Object.freeze({
  'image/jpeg': { categoria: 'imagen', ext: '.jpg' },
  'image/png': { categoria: 'imagen', ext: '.png' },
  'image/webp': { categoria: 'imagen', ext: '.webp' },
  'image/gif': { categoria: 'imagen', ext: '.gif' },
  'application/pdf': { categoria: 'documento', ext: '.pdf' },
  'video/mp4': { categoria: 'video', ext: '.mp4' },
  'video/webm': { categoria: 'video', ext: '.webm' },
  'video/quicktime': { categoria: 'video', ext: '.mov' },
  'audio/mpeg': { categoria: 'audio', ext: '.mp3' },
  'audio/wav': { categoria: 'audio', ext: '.wav' },
  'audio/ogg': { categoria: 'audio', ext: '.ogg' },
  'audio/mp4': { categoria: 'audio', ext: '.m4a' },
  'audio/x-m4a': { categoria: 'audio', ext: '.m4a' },
});

/** Texto plano (registros del EDR/SIEM, exportes): no tiene firma; se valida que sea UTF-8 sin bytes nulos. */
const TEXT_TYPES = Object.freeze({
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
});

export const ACCEPTED_EXTENSIONS = Object.freeze([
  ...new Set([...Object.values(BINARY_TYPES).map((t) => t.ext), '.jpeg', ...Object.keys(TEXT_TYPES)]),
]);

const MIN_VOID_REASON = 10;

function isUtf8Text(buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/** Determina tipo y categoría a partir del contenido; lanza ValidationError si no se admite. */
export async function detectFileType(buffer, originalName) {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected) {
    const known = BINARY_TYPES[detected.mime];
    if (!known) throw new ValidationError(`archivo: el tipo ${detected.mime} no está permitido`);
    return { mime: detected.mime, ...known };
  }
  const ext = extname(originalName).toLowerCase();
  if (TEXT_TYPES[ext] && isUtf8Text(buffer)) {
    return { mime: TEXT_TYPES[ext], categoria: 'registro', ext };
  }
  throw new ValidationError(`archivo: formato no reconocido. Se aceptan ${ACCEPTED_EXTENSIONS.join(', ')}`);
}

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** Nombre seguro para guardar y para la cabecera Content-Disposition. */
function sanitizeName(name) {
  const base = String(name ?? 'archivo').normalize('NFC').replace(/[\\/\u0000-\u001f<>:"|?*]+/g, '_').trim();
  return (base || 'archivo').slice(0, 200);
}

const EVIDENCE_SELECT = `
  SELECT e.id, e.incidente_id, e.accion_id, e.etapa, e.nombre_original, e.tipo_mime, e.categoria, e.tamano_bytes,
         e.sha256, e.almacenamiento, e.clave_almacenamiento, e.descripcion, e.subido_en, e.anulada, e.anulada_en,
         e.motivo_anulacion, e.subido_por, u.nombre AS subido_por_nombre, ua.nombre AS anulada_por_nombre,
         i.codigo AS incidente_codigo, i.titulo AS incidente_titulo, i.es_simulacro, a.descripcion AS accion_descripcion
    FROM evidencias e
    JOIN usuarios u ON u.id = e.subido_por
    JOIN incidentes i ON i.id = e.incidente_id
    LEFT JOIN usuarios ua ON ua.id = e.anulada_por
    LEFT JOIN acciones a ON a.id = e.accion_id`;

/** Quita los datos internos de almacenamiento antes de enviar al cliente. */
const toPublic = ({ almacenamiento, clave_almacenamiento, ...rest }) => rest;

async function getEvidenceRow(db, evidenceId) {
  const evidence = await db.one(`${EVIDENCE_SELECT} WHERE e.id = $1`, [evidenceId]);
  if (!evidence) throw new NotFoundError('Evidencia', evidenceId);
  return evidence;
}

/** Participa en el incidente: coordinador, responsable o responsable de alguna de sus acciones. */
async function assertCanUpload(db, user, incident) {
  if (user.rol === ROLES.COORDINATOR) return;
  if (incident.estado !== 'abierto') {
    throw new ForbiddenError('Solo el coordinador puede agregar evidencias a un incidente cerrado');
  }
  if (incident.responsable_id === user.id) return;
  const participates = await db.one('SELECT 1 FROM acciones WHERE incidente_id = $1 AND responsable_id = $2 LIMIT 1', [incident.id, user.id]);
  if (!participates) throw new ForbiddenError('Solo quienes participan en el incidente pueden cargar evidencias');
}

/**
 * Registra un archivo como evidencia. El contenido, sus metadatos, la huella SHA-256 y el
 * evento de bitácora se guardan juntos; si algo falla no queda nada a medias.
 */
export async function uploadEvidence(db, storage, incidentId, { file, descripcion, accionId }, user) {
  if (!file?.buffer?.length) throw new ValidationError('archivo: selecciona un archivo');
  const type = await detectFileType(file.buffer, file.originalname);
  const hash = sha256(file.buffer);
  const name = sanitizeName(file.originalname);
  const driver = storage.active;
  let savedKey = null;

  try {
    return await db.tx(async (tx) => {
      const incident = await tx.one('SELECT * FROM incidentes WHERE id = $1 FOR UPDATE', [incidentId]);
      if (!incident) throw new NotFoundError('Incidente', incidentId);
      await assertCanUpload(tx, user, incident);

      if (accionId) {
        const action = await tx.one('SELECT id FROM acciones WHERE id = $1 AND incidente_id = $2', [accionId, incidentId]);
        if (!action) throw new ValidationError('accionId: la acción no pertenece a este incidente');
      }
      const duplicate = await tx.one('SELECT id FROM evidencias WHERE incidente_id = $1 AND sha256 = $2 AND NOT anulada', [incidentId, hash]);
      if (duplicate) throw new BusinessRuleError(`Este archivo ya está registrado como evidencia #${duplicate.id} del incidente`);

      const { id } = await tx.one(
        `INSERT INTO evidencias (incidente_id, accion_id, etapa, nombre_original, tipo_mime, categoria, tamano_bytes,
                                 sha256, almacenamiento, clave_almacenamiento, descripcion, subido_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendiente', $10, $11) RETURNING id`,
        [incidentId, accionId ?? null, incident.etapa, name, type.mime, type.categoria, file.buffer.length,
          hash, driver.name, descripcion ?? null, user.id]
      );
      savedKey = await driver.save(tx, { evidenceId: id, buffer: file.buffer, ext: type.ext });
      await tx.run('UPDATE evidencias SET clave_almacenamiento = $1 WHERE id = $2', [savedKey, id]);

      await recordHistory(tx, {
        incidenteId: incidentId,
        evento: 'evidencia_registrada',
        estadoNuevo: type.categoria,
        detalle: `#${id} ${name} (${type.mime}, SHA-256 ${hash.slice(0, 12)}…)`,
        usuarioId: user.id,
      });
      return toPublic(await getEvidenceRow(tx, id));
    });
  } catch (error) {
    if (savedKey) await driver.discard(savedKey).catch(() => {});
    throw error;
  }
}

export async function listIncidentEvidence(db, incidentId) {
  const rows = await db.many(`${EVIDENCE_SELECT} WHERE e.incidente_id = $1 ORDER BY e.subido_en DESC, e.id DESC`, [incidentId]);
  return rows.map(toPublic);
}

/** Biblioteca multimedia: todas las evidencias con filtros y totales por categoría. */
export async function listEvidenceLibrary(db, { categoria, incidenteId, incluirAnuladas = false } = {}) {
  const rows = await db.many(
    `${EVIDENCE_SELECT}
      WHERE ($1::categoria_evidencia IS NULL OR e.categoria = $1)
        AND ($2::int IS NULL OR e.incidente_id = $2)
        AND ($3::boolean OR NOT e.anulada)
      ORDER BY e.subido_en DESC, e.id DESC
      LIMIT 500`,
    [categoria ?? null, incidenteId ?? null, incluirAnuladas]
  );
  const totales = await db.many(
    `SELECT categoria, count(*) AS cantidad, sum(tamano_bytes) AS bytes
       FROM evidencias WHERE NOT anulada GROUP BY categoria ORDER BY categoria`
  );
  return { evidencias: rows.map(toPublic), totales };
}

/** Contenido para visualizar o descargar; el control de acceso ya lo hizo la ruta. */
export async function readEvidenceContent(db, storage, evidenceId) {
  const evidence = await getEvidenceRow(db, evidenceId);
  const buffer = await storage.forEvidence(evidence).read(db, evidence);
  return { evidence, buffer };
}

/** Recalcula la huella y la compara con la registrada al cargar (cadena de custodia). */
export async function verifyEvidenceIntegrity(db, storage, evidenceId) {
  const { evidence, buffer } = await readEvidenceContent(db, storage, evidenceId);
  const actual = sha256(buffer);
  return { id: evidence.id, integra: actual === evidence.sha256, sha256Registrado: evidence.sha256, sha256Actual: actual, verificadoEn: new Date().toISOString() };
}

/** Las evidencias no se borran: se anulan con motivo, y el archivo se conserva para auditoría. */
export function voidEvidence(db, evidenceId, { motivo }, user) {
  return db.tx(async (tx) => {
    const evidence = await tx.one('SELECT * FROM evidencias WHERE id = $1 FOR UPDATE', [evidenceId]);
    if (!evidence) throw new NotFoundError('Evidencia', evidenceId);
    if (user.rol !== ROLES.COORDINATOR && evidence.subido_por !== user.id) {
      throw new ForbiddenError('Solo el coordinador o quien cargó la evidencia pueden anularla');
    }
    if (evidence.anulada) throw new BusinessRuleError('La evidencia ya está anulada');
    const reason = motivo?.trim() ?? '';
    if (reason.length < MIN_VOID_REASON) {
      throw new ValidationError(`motivo: explica en al menos ${MIN_VOID_REASON} caracteres por qué se anula`);
    }
    await tx.run(
      'UPDATE evidencias SET anulada = TRUE, anulada_por = $1, anulada_en = now(), motivo_anulacion = $2 WHERE id = $3',
      [user.id, reason, evidenceId]
    );
    await recordHistory(tx, {
      incidenteId: evidence.incidente_id,
      evento: 'evidencia_anulada',
      estadoAnterior: 'vigente',
      estadoNuevo: 'anulada',
      detalle: `#${evidenceId} ${evidence.nombre_original}: ${reason}`,
      usuarioId: user.id,
    });
    return toPublic(await getEvidenceRow(tx, evidenceId));
  });
}

/** Cabecera Content-Disposition con nombre UTF-8 (RFC 6266 / RFC 5987). */
export function contentDisposition(name, download) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
