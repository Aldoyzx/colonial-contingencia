/**
 * Simulacro del plan de contingencia (paso 5 de la Actividad 2).
 *
 * Ejecuta sobre la base configurada (DATABASE_URL) un incidente marcado como simulacro:
 * ransomware que entra por la VPN sin MFA y cuya primera erradicación falla por
 * persistencia en el directorio activo. Cada acción la completa su responsable real,
 * así se comprueba también la asignación de responsables y los permisos.
 * Al terminar escribe el informe en docs/evidencias/.
 *
 * Uso: cd server && npm run simulacro
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { BusinessRuleError, ForbiddenError, ValidationError } from '../src/domain/errors.js';
import { ensureDatabase } from '../src/db/migrate.js';
import { createDb } from '../src/db/pool.js';
import { updateAction } from '../src/services/actionService.js';
import { advanceIncident, createIncident, decideIncident, getIncidentDetail } from '../src/services/incidentService.js';
import { changeServiceStatus, getDashboard } from '../src/services/serviceStatusService.js';
import { getActiveUser } from '../src/services/userService.js';

const EVIDENCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'evidencias');

const db = createDb(config.databaseUrl);
const checks = [];
const started = Date.now();

function check(paso, esperado, ok, obtenido) {
  checks.push({ paso, esperado, ok: Boolean(ok), obtenido });
  console.log(`${ok ? '✔' : '✘'} ${paso}: ${obtenido}`);
}

/** Verifica que la operación sea rechazada con el tipo de error esperado. */
async function expectRejection(paso, esperado, ErrorType, operation) {
  try {
    await operation();
    check(paso, esperado, false, 'La operación se permitió');
  } catch (error) {
    check(paso, esperado, error instanceof ErrorType, `Rechazado (${error.constructor.name}): ${error.message}`);
  }
}

/** Cada acción abierta de la etapa la cierra el usuario al que el sistema se la asignó. */
async function closeStageAsOwners(detail, { fallar = null } = {}) {
  const open = detail.acciones.filter((a) => a.etapa === detail.etapa && ['pendiente', 'en_progreso'].includes(a.estado));
  for (const action of open) {
    const owner = await getActiveUser(db, action.responsable_id);
    const failThis = fallar?.(action);
    await updateAction(db, action.id, failThis
      ? { estado: 'fallida', resultado: failThis }
      : { estado: 'completada', resultado: `Ejecutado por ${owner.nombre}` }, owner);
  }
  return getIncidentDetail(db, detail.id);
}

const roleOfOwner = (detail, predicate) => detail.acciones.find(predicate)?.responsable_rol;

async function run() {
  await ensureDatabase(db);
  const [coord, analista, operador] = await Promise.all([1, 2, 3].map((id) => getActiveUser(db, id)));
  const services = Object.fromEntries((await db.many('SELECT id, codigo FROM servicios')).map((s) => [s.codigo, s.id]));

  const openOperational = await db.one(`SELECT count(*) AS total FROM incidentes WHERE estado = 'abierto'`);
  if (openOperational.total > 0) {
    throw new Error('Hay incidentes abiertos: cierra o reinicia la base (npm run db:demo) antes del simulacro');
  }

  // 1. Identificación y registro
  let d = await createIncident(db, {
    titulo: 'SIMULACRO: ransomware por VPN sin MFA',
    descripcion: 'Escenario de práctica: nota de rescate en facturación; acceso inicial con credenciales filtradas de la VPN.',
    severidad: 'alta',
    responsableId: coord.id,
    servicioIds: [services['TI-FACT'], services['TI-VPN'], services['TI-AD']],
    esSimulacro: true,
  }, analista);
  let dash = await getDashboard(db);
  check('1. Registro del incidente', 'Código asignado, 3 servicios TI afectados, marcado como simulacro',
    d.es_simulacro && dash.resumen.afectado === 3, `${d.codigo}; afectados = ${dash.resumen.afectado}; simulacro = ${d.es_simulacro}`);
  check('1. Responsable de detección', 'La acción de detección se asigna al analista TI',
    roleOfOwner(d, (a) => a.etapa === 'deteccion') === 'analista_ti', `Asignada a ${d.acciones[0].responsable_nombre}`);

  await expectRejection('2. Control de etapa', 'No se avanza con acciones pendientes', BusinessRuleError,
    () => advanceIncident(db, d.id, {}, coord));

  // 2. Evaluación y D1
  d = await closeStageAsOwners(d);
  d = await advanceIncident(db, d.id, {}, coord);
  check('3. Evaluación', 'El sistema plantea la decisión D1', d.siguientePaso.codigo === 'D1', d.siguientePaso.pregunta);
  d = await closeStageAsOwners(d);
  await expectRejection('4. Permisos de decisión', 'Solo el coordinador decide D1–D4', ForbiddenError,
    () => decideIncident(db, d.id, { respuesta: true, justificacion: 'Intento sin permiso' }, analista));
  d = await decideIncident(db, d.id, { respuesta: true, justificacion: 'No hay certeza de aislamiento TI/OT' }, coord);
  dash = await getDashboard(db);
  check('5. D1 = Sí (contención preventiva)', 'Los 4 servicios OT se detienen; disponibilidad 30 %',
    dash.servicios.OT.every((s) => s.estado === 'afectado') && dash.resumen.disponibilidad === 30,
    `OT afectados = ${dash.servicios.OT.filter((s) => s.estado === 'afectado').length}; disponibilidad = ${dash.resumen.disponibilidad} %`);

  // 3. Contención y D2
  d = await closeStageAsOwners(d);
  d = await decideIncident(db, d.id, { respuesta: false, justificacion: 'Respaldos sin verificar' }, coord);
  check('6. D2 = No', 'Se asigna a Asesoría legal la evaluación del rescate',
    roleOfOwner(d, (a) => a.origen === 'D2:no') === 'legal', d.acciones.find((a) => a.origen === 'D2:no')?.responsable_nombre);

  // 4. Erradicación fallida → análisis forense → reintento
  d = await closeStageAsOwners(d, {
    fallar: (a) => (a.origen === 'entrada:erradicacion' ? 'Persistencia detectada en el directorio activo' : null),
  });
  await expectRejection('7. Validación del reinicio', 'D3 = Sí se rechaza si la erradicación falló', BusinessRuleError,
    () => decideIncident(db, d.id, { respuesta: true, justificacion: 'Intento de reinicio prematuro' }, coord));
  d = await decideIncident(db, d.id, { respuesta: false, justificacion: 'Persisten indicadores de compromiso' }, coord);
  check('8. D3 = No (recuperación fallida)', 'Pasa a análisis forense y cuenta 1 intento fallido',
    d.etapa === 'analisis_forense' && d.intentos_erradicacion === 1, `Etapa = ${d.etapa}; intentos = ${d.intentos_erradicacion}`);
  d = await closeStageAsOwners(d);
  d = await advanceIncident(db, d.id, {}, coord);
  check('9. Reintento', 'Vuelve a erradicación con una acción nueva',
    d.etapa === 'erradicacion' && d.acciones.filter((a) => a.origen === 'entrada:erradicacion').length === 2,
    `Etapa = ${d.etapa}`);
  d = await closeStageAsOwners(d);
  d = await decideIncident(db, d.id, { respuesta: true, justificacion: 'Segundo barrido limpio; MFA activo en la VPN' }, coord);
  dash = await getDashboard(db);
  check('10. D3 = Sí (recuperación)', 'Los servicios afectados pasan a "en recuperación"',
    dash.resumen.en_recuperacion === 7, `En recuperación = ${dash.resumen.en_recuperacion}`);

  // 5. Recuperación por tramos
  await expectRejection('11. Dominio de cada rol', 'El analista TI no puede operar tramos OT', ForbiddenError,
    () => changeServiceStatus(db, services['OT-T1'], { estado: 'operativo' }, analista));
  await changeServiceStatus(db, services['OT-SCADA'], { estado: 'operativo', nota: 'SCADA validado' }, operador);
  check('12. Reinicio manual por tramos', 'El operador OT habilita SCADA antes que los tramos', true, 'OT-SCADA → operativo');
  d = await closeStageAsOwners(d);
  d = await decideIncident(db, d.id, { respuesta: true, justificacion: 'Riesgo de desabastecimiento en el sureste' }, coord);
  check('13. D4 = Sí (ruta alternativa)', 'Comunicaciones recibe el transporte por camiones',
    roleOfOwner(d, (a) => a.origen === 'D4:si') === 'comunicaciones', d.acciones.find((a) => a.origen === 'D4:si')?.responsable_nombre);
  d = await closeStageAsOwners(d);
  d = await advanceIncident(db, d.id, {}, coord);
  dash = await getDashboard(db);
  check('14. Servicio restablecido', 'Disponibilidad 100 %', dash.resumen.disponibilidad === 100, `Disponibilidad = ${dash.resumen.disponibilidad} %`);

  // 6. Cierre
  d = await closeStageAsOwners(d);
  d = await advanceIncident(db, d.id, {}, coord);
  d = await closeStageAsOwners(d);
  await expectRejection('15. Cierre controlado', 'No se cierra sin lecciones aprendidas', ValidationError,
    () => advanceIncident(db, d.id, {}, coord));
  d = await advanceIncident(db, d.id, {
    leccionesAprendidas: 'El simulacro confirmó el flujo; reforzar el monitoreo del directorio activo y ensayar la ruta alternativa con el proveedor logístico.',
  }, coord);
  check('16. Cierre', 'Incidente cerrado con 5 decisiones registradas en la bitácora',
    d.estado === 'cerrado' && d.decisiones.length === 5, `Estado = ${d.estado}; decisiones = ${d.decisiones.map((x) => `${x.codigo}:${x.respuesta ? 'Sí' : 'No'}`).join(', ')}`);

  return d;
}

function writeReport(detail, failure) {
  const passed = checks.filter((c) => c.ok).length;
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const rows = checks.map((c) => `| ${c.paso} | ${c.esperado} | ${String(c.obtenido ?? '').replaceAll('|', '/')} | ${c.ok ? '✔' : '✘'} |`).join('\n');
  const actions = (detail?.acciones ?? [])
    .map((a) => `| ${a.etapa} | ${a.descripcion} | ${a.responsable_nombre} | ${a.estado} |`).join('\n');

  const md = `# Informe de simulacro · ${detail?.codigo ?? 'sin código'}

- **Fecha:** ${now.toLocaleString('es-CO')}
- **Escenario:** ransomware por VPN sin MFA; la primera erradicación falla por persistencia en el directorio activo.
- **Resultado:** ${passed} de ${checks.length} verificaciones correctas${failure ? ` · interrumpido: ${failure.message}` : ''}
- **Duración de la ejecución automatizada:** ${((Date.now() - started) / 1000).toFixed(1)} s
- **Eventos en la bitácora:** ${detail?.historial?.length ?? 0}

## Verificaciones

| Paso | Resultado esperado | Resultado obtenido | OK |
|---|---|---|---|
${rows}

## Acciones ejecutadas y sus responsables

| Etapa | Acción | Responsable | Estado |
|---|---|---|---|
${actions}
`;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = join(EVIDENCE_DIR, `simulacro-${stamp}.md`);
  writeFileSync(file, md);
  console.log(`\nInforme: ${file}  (${passed}/${checks.length} correctas)`);
  return passed === checks.length;
}

let detail = null;
let failure = null;
try {
  detail = await run();
} catch (error) {
  failure = error;
  console.error(`\nSimulacro interrumpido: ${error.message}`);
} finally {
  const ok = writeReport(detail, failure);
  process.exitCode = ok && !failure ? 0 : 1;
  await db.close();
}
