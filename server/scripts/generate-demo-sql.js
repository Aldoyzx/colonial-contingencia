/**
 * Genera la parte histórica de database/04_datos_prueba.sql.
 *
 * Los incidentes se producen con el MOTOR REAL del sistema (los mismos servicios que usa
 * la API) sobre una base temporal, así respetan todas las reglas del plan. Después cada
 * fila se vuelve a fechar según el cronograma del escenario y se exporta como INSERT.
 *
 * Uso: DEMO_GEN_DATABASE_URL=postgres://.../contingencia_gen npm run db:generate-demo
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SQL_FILES } from '../src/db/files.js';
import { resetDatabase } from '../src/db/migrate.js';
import { createDb } from '../src/db/pool.js';
import { updateAction } from '../src/services/actionService.js';
import { advanceIncident, createIncident, decideIncident } from '../src/services/incidentService.js';
import { changeServiceStatus } from '../src/services/serviceStatusService.js';
import { getActiveUser } from '../src/services/userService.js';

const MARKER = '-- >>> HISTÓRICO GENERADO (no editar a mano: npm run db:generate-demo)';
const url = process.env.DEMO_GEN_DATABASE_URL ?? 'postgres://contingencia:contingencia@localhost:5432/contingencia_gen';

/**
 * Cada operación lleva su hora (desde la detección). 'cerrar' completa las acciones abiertas
 * de la etapa con su responsable; 'fallar' marca como fallida la acción de erradicación.
 */
const SCENARIOS = [
  {
    codigo: 'INC-2023-0002', inicio: '2023-03-14T08:20:00-05:00', severidad: 'media',
    titulo: 'Phishing con robo de credenciales de VPN',
    descripcion: 'Un correo que suplantaba a la mesa de ayuda obtuvo credenciales de dos empleados; hubo accesos a la VPN desde el exterior.',
    servicios: ['TI-VPN', 'TI-MAIL'],
    ops: [['crear', 0], ['cerrar', 0.5], ['avanzar', 0.6], ['cerrar', 1.5], ['decidir', 1.6, false, 'Sin evidencia de movimiento hacia la red OT'],
      ['cerrar', 4], ['decidir', 4.2, true, 'Respaldos del correo verificados el mismo día'], ['cerrar', 12], ['decidir', 12.5, true, 'Credenciales rotadas y MFA activado a los afectados'],
      ['cerrar', 18], ['decidir', 18.2, false, 'Sin impacto en el suministro'], ['cerrar', 20], ['avanzar', 20.1], ['cerrar', 22],
      ['cerrar-incidente', 22.5, 'Capacitar contra phishing, exigir MFA en toda cuenta remota y bloquear accesos desde países no autorizados.']],
  },
  {
    codigo: 'INC-2024-0003', inicio: '2024-02-20T14:05:00-05:00', severidad: 'alta',
    titulo: 'Ransomware en estación de ingeniería OT',
    descripcion: 'Cifrado de archivos en una estación de ingeniería con acceso a SCADA; se detectó por alertas del EDR.',
    servicios: ['OT-SCADA', 'TI-AD'],
    ops: [['crear', 0], ['cerrar', 0.3], ['avanzar', 0.4], ['cerrar', 1], ['decidir', 1.1, true, 'La estación tiene acceso directo a SCADA'],
      ['cerrar', 6], ['decidir', 6.5, true, 'Imagen limpia de la estación disponible'], ['fallar', 20, 'Persistencia por tarea programada en el dominio'],
      ['decidir', 20.5, false, 'Persisten indicadores de compromiso'], ['cerrar', 36], ['avanzar', 36.2], ['cerrar', 44],
      ['decidir', 44.5, true, 'Barrido limpio tras eliminar la tarea programada'], ['servicio', 50, 'OT-SCADA', 'operativo', 'SCADA validado por el operador'],
      ['cerrar', 60], ['decidir', 60.5, false, 'El oleoducto operó en modo manual sin desabastecimiento'], ['cerrar', 68], ['avanzar', 68.1], ['cerrar', 72],
      ['cerrar-incidente', 72.5, 'Separar las estaciones de ingeniería en una zona propia de la red OT y auditar tareas programadas del dominio.']],
  },
  {
    codigo: 'INC-2024-0004', inicio: '2024-06-11T09:00:00-05:00', severidad: 'alta', simulacro: true,
    titulo: 'Simulacro trimestral: ransomware por VPN',
    descripcion: 'Ejercicio de mesa del comité de crisis con el escenario de Colonial Pipeline.',
    servicios: ['TI-FACT', 'TI-VPN'],
    ops: [['crear', 0], ['cerrar', 0.2], ['avanzar', 0.25], ['cerrar', 0.5], ['decidir', 0.6, true, 'Ejercicio: se asume riesgo para OT'],
      ['cerrar', 1.2], ['decidir', 1.3, false, 'Ejercicio: respaldos no verificados'], ['cerrar', 2.5], ['decidir', 2.6, true, 'Ejercicio: validación aprobada'],
      ['cerrar', 3.5], ['decidir', 3.6, true, 'Ejercicio: riesgo de desabastecimiento'], ['cerrar', 4.5], ['avanzar', 4.6], ['cerrar', 5.2], ['avanzar', 5.3], ['cerrar', 5.8],
      ['cerrar-incidente', 6, 'El comité tardó 35 minutos en decidir D1: preparar criterios de decisión por escrito.']],
  },
  {
    codigo: 'INC-2025-0005', inicio: '2025-01-09T22:40:00-05:00', severidad: 'alta',
    titulo: 'Malware en servidor de facturación',
    descripcion: 'Proceso desconocido con conexiones a un servidor de comando y control desde el servidor de facturación.',
    servicios: ['TI-FACT', 'TI-ERP'],
    ops: [['crear', 0], ['cerrar', 0.4], ['avanzar', 0.5], ['cerrar', 1.2], ['decidir', 1.3, false, 'Segmentación TI/OT verificada; sin conexiones hacia OT'],
      ['cerrar', 5], ['decidir', 5.2, true, 'Respaldo inmutable de la noche anterior'], ['cerrar', 18], ['decidir', 18.5, true, 'Servidor reconstruido desde imagen limpia'],
      ['cerrar', 26], ['decidir', 26.2, false, 'La facturación se difirió sin afectar entregas'], ['cerrar', 30], ['avanzar', 30.1], ['cerrar', 32],
      ['cerrar-incidente', 33, 'La segmentación TI/OT evitó detener el oleoducto: mantenerla y probar restauraciones cada mes.']],
  },
  {
    codigo: 'INC-2025-0006', inicio: '2025-09-23T08:30:00-05:00', severidad: 'media', simulacro: true,
    titulo: 'Simulacro: erradicación fallida',
    descripcion: 'Ejercicio con persistencia en el directorio activo para practicar la ruta de análisis forense.',
    servicios: ['TI-AD', 'TI-VPN'],
    ops: [['crear', 0], ['cerrar', 0.2], ['avanzar', 0.25], ['cerrar', 0.4], ['decidir', 0.5, true, 'Ejercicio'], ['cerrar', 1], ['decidir', 1.1, true, 'Ejercicio'],
      ['fallar', 2, 'Ejercicio: persistencia detectada'], ['decidir', 2.1, false, 'Ejercicio'], ['cerrar', 3.5], ['avanzar', 3.6], ['cerrar', 4.5],
      ['decidir', 4.6, true, 'Ejercicio'], ['cerrar', 5.5], ['decidir', 5.6, false, 'Ejercicio'], ['cerrar', 6.2], ['avanzar', 6.3], ['cerrar', 7],
      ['cerrar-incidente', 7.5, 'El análisis forense tomó más de lo previsto: contratar con anticipación al proveedor externo.']],
  },
  {
    codigo: 'INC-2026-0007', inicio: '2026-04-02T03:15:00-05:00', severidad: 'alta',
    titulo: 'Acceso no autorizado a la plataforma de respaldos',
    descripcion: 'Intentos de borrar copias de seguridad con una cuenta de servicio comprometida.',
    servicios: ['TI-BKP', 'TI-AD'],
    ops: [['crear', 0], ['cerrar', 0.6], ['avanzar', 0.7], ['cerrar', 2], ['decidir', 2.2, true, 'La cuenta de servicio tiene acceso a la red OT'],
      ['cerrar', 8], ['decidir', 8.5, false, 'Parte de los respaldos fue alterada'], ['fallar', 30, 'La cuenta comprometida seguía activa en un segundo dominio'],
      ['decidir', 30.5, false, 'Persisten accesos'], ['cerrar', 44], ['avanzar', 44.2], ['fallar', 56, 'Puerta trasera en el servidor de respaldos'],
      ['decidir', 56.5, false, 'Segundo intento fallido'], ['cerrar', 70], ['avanzar', 70.2], ['cerrar', 80], ['decidir', 80.5, true, 'Dominio y respaldos reconstruidos'],
      ['servicio', 84, 'OT-SCADA', 'operativo', 'SCADA validado'], ['servicio', 86, 'OT-T1', 'operativo', null], ['cerrar', 90],
      ['decidir', 90.5, true, 'Inventarios bajos en el sureste'], ['cerrar', 98], ['avanzar', 98.1], ['cerrar', 104], ['avanzar', 104.1], ['cerrar', 105],
      ['cerrar-incidente', 106, 'Proteger los respaldos con inmutabilidad y cuentas separadas; revisar cuentas de servicio cada trimestre.']],
  },
];

async function closeStage(db, incidentId, mode = null) {
  const { many } = db;
  const incident = await db.one('SELECT etapa FROM incidentes WHERE id = $1', [incidentId]);
  const open = await many(`SELECT * FROM acciones WHERE incidente_id = $1 AND etapa = $2 AND estado IN ('pendiente','en_progreso') ORDER BY id`, [incidentId, incident.etapa]);
  for (const a of open) {
    const owner = await getActiveUser(db, a.responsable_id);
    const fail = mode && a.origen === 'entrada:erradicacion';
    await updateAction(db, a.id, fail ? { estado: 'fallida', resultado: mode } : { estado: 'completada', resultado: 'Ejecutado según el plan' }, owner);
  }
}

async function runScenario(db, s, users, services) {
  let incidentId = null;
  const boundaries = []; // [hasta (tiempo real), hora sintética]
  const clock = async () => (await db.one('SELECT clock_timestamp() AS t')).t;
  const start = new Date(s.inicio).getTime();

  for (const op of s.ops) {
    const [kind, at] = op;
    if (kind === 'crear') {
      const detail = await createIncident(db, {
        titulo: s.titulo, descripcion: s.descripcion, severidad: s.severidad, responsableId: users.coordinador.id,
        servicioIds: s.servicios.map((c) => services[c]), esSimulacro: Boolean(s.simulacro),
      }, users.analista);
      incidentId = detail.id;
    } else if (kind === 'cerrar') await closeStage(db, incidentId);
    else if (kind === 'fallar') await closeStage(db, incidentId, op[2]);
    else if (kind === 'avanzar') await advanceIncident(db, incidentId, {}, users.coordinador);
    else if (kind === 'decidir') await decideIncident(db, incidentId, { respuesta: op[2], justificacion: op[3] }, users.coordinador);
    else if (kind === 'servicio') await changeServiceStatus(db, services[op[2]], { estado: op[3], nota: op[4] ?? undefined }, users.coordinador);
    else if (kind === 'cerrar-incidente') await advanceIncident(db, incidentId, { leccionesAprendidas: op[2] }, users.coordinador);
    boundaries.push([await clock(), new Date(start + at * 3_600_000)]);
  }
  return { incidentId, boundaries };
}

const retime = (boundaries) => (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  const hit = boundaries.find(([until]) => t <= new Date(until).getTime());
  return (hit ?? boundaries.at(-1))[1].toISOString();
};

const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const userRef = (emailById) => (id) => (id === null ? 'NULL' : `(SELECT id FROM usuarios WHERE email = ${lit(emailById[id])})`);
const serviceRef = (codeById) => (id) => (id === null ? 'NULL' : `(SELECT id FROM servicios WHERE codigo = ${lit(codeById[id])})`);

async function exportScenario(db, s, { incidentId, boundaries }, refs) {
  const T = retime(boundaries);
  const inc = await db.one('SELECT * FROM incidentes WHERE id = $1', [incidentId]);
  const fix = (text) => (text == null ? text : String(text).replaceAll(inc.codigo, s.codigo));
  const incRef = `(SELECT id FROM incidentes WHERE codigo = ${lit(s.codigo)})`;
  const out = [`-- ${s.codigo} · ${s.titulo}${s.simulacro ? ' (simulacro)' : ''}`];

  out.push(`INSERT INTO incidentes (codigo, titulo, descripcion, severidad, etapa, estado, intentos_erradicacion, es_simulacro, lecciones_aprendidas, responsable_id, creado_por, detectado_en, cerrado_en) VALUES
  (${[s.codigo, inc.titulo, inc.descripcion, inc.severidad, inc.etapa, inc.estado, inc.intentos_erradicacion, inc.es_simulacro, inc.lecciones_aprendidas].map(lit).join(', ')}, ${refs.user(inc.responsable_id)}, ${refs.user(inc.creado_por)}, ${lit(T(inc.detectado_en))}, ${lit(T(inc.cerrado_en))});`);

  const links = await db.many('SELECT * FROM incidente_servicios WHERE incidente_id = $1 ORDER BY servicio_id', [incidentId]);
  out.push(`INSERT INTO incidente_servicios (incidente_id, servicio_id, vinculado_en) VALUES\n${links.map((l) => `  (${incRef}, ${refs.service(l.servicio_id)}, ${lit(T(l.vinculado_en))})`).join(',\n')};`);

  const actions = await db.many('SELECT * FROM acciones WHERE incidente_id = $1 ORDER BY id', [incidentId]);
  out.push(`INSERT INTO acciones (incidente_id, etapa, origen, descripcion, responsable_id, estado, resultado, creada_en, actualizada_en) VALUES\n${actions.map((a) =>
    `  (${incRef}, ${lit(a.etapa)}, ${lit(a.origen)}, ${lit(a.descripcion)}, ${refs.user(a.responsable_id)}, ${lit(a.estado)}, ${lit(a.resultado)}, ${lit(T(a.creada_en))}, ${lit(T(a.actualizada_en))})`).join(',\n')};`);

  const decisions = await db.many('SELECT * FROM decisiones WHERE incidente_id = $1 ORDER BY id', [incidentId]);
  out.push(`INSERT INTO decisiones (incidente_id, codigo, pregunta, respuesta, justificacion, etapa_origen, etapa_destino, usuario_id, tomada_en) VALUES\n${decisions.map((d) =>
    `  (${incRef}, ${lit(d.codigo)}, ${lit(d.pregunta)}, ${lit(d.respuesta)}, ${lit(d.justificacion)}, ${lit(d.etapa_origen)}, ${lit(d.etapa_destino)}, ${refs.user(d.usuario_id)}, ${lit(T(d.tomada_en))})`).join(',\n')};`);

  const history = await db.many('SELECT * FROM historial_recuperacion WHERE incidente_id = $1 OR (incidente_id IS NULL AND fecha BETWEEN $2 AND $3) ORDER BY id',
    [incidentId, inc.detectado_en, boundaries.at(-1)[0]]);
  out.push(`INSERT INTO historial_recuperacion (incidente_id, servicio_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, fecha) VALUES\n${history.map((h) =>
    `  (${incRef}, ${refs.service(h.servicio_id)}, ${lit(h.evento)}, ${lit(h.estado_anterior)}, ${lit(h.estado_nuevo)}, ${lit(fix(h.detalle))}, ${refs.user(h.usuario_id)}, ${lit(T(h.fecha))})`).join(',\n')};`);
  return out.join('\n\n');
}

const db = createDb(url);
try {
  await resetDatabase(db);
  const users = { coordinador: await getActiveUser(db, 1), analista: await getActiveUser(db, 2) };
  const serviceRows = await db.many('SELECT id, codigo FROM servicios');
  const services = Object.fromEntries(serviceRows.map((r) => [r.codigo, r.id]));
  const emailById = Object.fromEntries((await db.many('SELECT id, email FROM usuarios')).map((r) => [r.id, r.email]));
  const refs = { user: userRef(emailById), service: serviceRef(Object.fromEntries(serviceRows.map((r) => [r.id, r.codigo]))) };

  const blocks = [];
  for (const s of SCENARIOS) {
    const run = await runScenario(db, s, users, services);
    blocks.push(await exportScenario(db, s, run, refs));
  }

  const current = readFileSync(SQL_FILES.demo, 'utf8');
  // La primera vez se corta el cierre del bloque escrito a mano (setval y COMMIT); el histórico
  // continúa dentro de la misma transacción.
  const cut = current.includes(MARKER) ? current.indexOf(MARKER) : current.indexOf('-- Los próximos incidentes');
  const head = current.slice(0, cut);
  const sql = `${head}${MARKER}
-- Incidentes producidos con el motor real del sistema y fechados según un cronograma (ver scripts/generate-demo-sql.js).

${blocks.join('\n\n')}

-- Los próximos incidentes continúan la numeración.
SELECT setval('incidente_numero_seq', (SELECT count(*) FROM incidentes));

COMMIT;
`;
  writeFileSync(SQL_FILES.demo, sql);
  console.log(`Generado ${SQL_FILES.demo} con ${SCENARIOS.length} incidentes históricos`);
} finally {
  await db.close();
}
