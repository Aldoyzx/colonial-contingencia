export const SERVICE_STATE_LABELS = {
  operativo: 'Operativo',
  afectado: 'Afectado',
  en_recuperacion: 'En recuperación',
};

/** Espejo de las transiciones manuales del servidor (el servidor sigue siendo la autoridad). */
export const SERVICE_TRANSITIONS = {
  operativo: ['afectado'],
  afectado: ['en_recuperacion'],
  en_recuperacion: ['operativo', 'afectado'],
};

export const STAGE_LABELS = {
  deteccion: 'Detección',
  evaluacion: 'Evaluación',
  contencion: 'Contención',
  erradicacion: 'Erradicación',
  analisis_forense: 'Análisis forense',
  recuperacion: 'Recuperación',
  ruta_alternativa: 'Ruta alternativa',
  servicio_restablecido: 'Servicio restablecido',
  cierre: 'Cierre',
  finalizado: 'Finalizado',
};

export const stageLabel = (key) => STAGE_LABELS[key] ?? key;

export const ACTION_STATE_LABELS = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completada: 'Completada',
  fallida: 'Fallida',
};

export const SEVERITY_LABELS = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

export const ROLE_LABELS = {
  coordinador: 'Coordinador de respuesta',
  analista_ti: 'Analista TI',
  operador_ot: 'Operador OT',
  legal: 'Asesoría legal',
  comunicaciones: 'Comunicaciones',
};

export const EVENT_LABELS = {
  incidente_registrado: 'Incidente registrado',
  servicio_afectado: 'Servicio afectado',
  cambio_etapa: 'Cambio de etapa',
  decision: 'Decisión',
  accion_asignada: 'Acción asignada',
  accion_actualizada: 'Acción actualizada',
  detencion_preventiva: 'Detención preventiva',
  inicio_recuperacion: 'Inicio de recuperación',
  servicio_restablecido: 'Servicio restablecido',
  cambio_estado_servicio: 'Cambio manual de estado',
  escalamiento: 'Escalamiento',
  incidente_cerrado: 'Incidente cerrado',
  evidencia_registrada: 'Evidencia registrada',
  evidencia_anulada: 'Evidencia anulada',
  activo_aislado: 'Activo aislado',
  activo_liberado: 'Activo reconectado',
  ronda_iniciada: 'Ronda de verificación iniciada',
  verificacion_activo: 'Activo verificado',
  ronda_cerrada: 'Ronda de verificación cerrada',
};

/** Mismos criterios que el servidor (domain/permissions.js): coordinador o el rol dueño de la red. */
export function canOperateAsset(user, asset) {
  if (!user || !asset) return false;
  return user.rol === 'coordinador' || (user.rol === 'analista_ti' && asset.red === 'TI') || (user.rol === 'operador_ot' && asset.red === 'OT');
}

export const canStartRound = (user) => ['coordinador', 'analista_ti', 'operador_ot'].includes(user?.rol);

export const HEAT_LABELS = ['Sin riesgo', 'Muy bajo', 'Bajo', 'Medio', 'Alto', 'Crítico'];

export const VERIFICATION_LABELS = { ok: 'OK', observado: 'Observado', falla: 'Falla' };

export const LOCATION_TYPE_LABELS = {
  centro_control: 'Centro de control',
  centro_datos: 'Centro de datos',
  estacion_bombeo: 'Estación de bombeo',
  patio_tanques: 'Patio de tanques',
  terminal: 'Terminal',
};

export const formatPercent = (value) => `${Math.round((value ?? 0) * 100)}%`;

export function canChangeService(user, service) {
  if (!user) return false;
  return (
    user.rol === 'coordinador' ||
    (user.rol === 'analista_ti' && service.tipo === 'TI') ||
    (user.rol === 'operador_ot' && service.tipo === 'OT')
  );
}

/** PostgreSQL devuelve TIMESTAMPTZ en ISO 8601 con zona; se muestra en la hora local del navegador. */
export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export const RESOURCE_CATEGORY_LABELS = {
  herramienta: 'Herramienta',
  infraestructura: 'Infraestructura',
  servicio_externo: 'Servicio externo',
  documento: 'Documento',
};

export const STAGE_TYPE_LABELS = {
  accion: 'Acción',
  decision: 'Decisión',
};

export const EVIDENCE_CATEGORY = {
  imagen: 'Imágenes',
  documento: 'Documentos',
  video: 'Videos',
  audio: 'Audios',
  registro: 'Registros',
};

export const SECURITY_EVENT_LABELS = {
  login_exitoso: 'Inicio de sesión',
  login_fallido: 'Intento fallido',
  cuenta_bloqueada: 'Cuenta bloqueada',
  mfa_fallido: 'Código MFA incorrecto',
  mfa_activado: 'MFA activado',
  mfa_desactivado: 'MFA desactivado',
  cierre_sesion: 'Cierre de sesión',
  cambio_clave: 'Cambio de contraseña',
  acceso_denegado: 'Acceso denegado',
};

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export const formatHours = (h) => (h === null || h === undefined ? '—' : h >= 48 ? `${(h / 24).toFixed(1)} días` : `${Number(h).toFixed(1)} h`);
