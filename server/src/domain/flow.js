/**
 * Plan de contingencia de Colonial Pipeline modelado como máquina de estados.
 * Cada etapa corresponde a un nodo del diagrama de flujo; las decisiones D1–D4
 * son los rombos y determinan la ruta (Sí / No).
 */

export const STAGE_TYPE = Object.freeze({
  ACTION: 'accion',
  DECISION: 'decision',
  FINAL: 'final',
});

export const SERVICE_EFFECT = Object.freeze({
  STOP_OT: 'detener_ot',
  START_RECOVERY: 'iniciar_recuperacion',
  RESTORE_ALL: 'restablecer_servicios',
});

export const MAX_ERADICATION_ATTEMPTS = 3;
export const MIN_LESSONS_LENGTH = 20;

export const STAGES = Object.freeze({
  deteccion: {
    orden: 1,
    nombre: 'Detección',
    tipo: STAGE_TYPE.ACTION,
    siguiente: 'evaluacion',
    accionAlEntrar: { descripcion: 'Confirmar nota de rescate y actividad anómala en sistemas TI', rol: 'analista_ti' },
  },
  evaluacion: {
    orden: 2,
    nombre: 'Evaluación',
    tipo: STAGE_TYPE.DECISION,
    decision: 'D1',
    accionAlEntrar: { descripcion: 'Activar equipo de respuesta; medir alcance, sistemas afectados y riesgo para la red OT', rol: 'coordinador' },
  },
  contencion: {
    orden: 3,
    nombre: 'Contención',
    tipo: STAGE_TYPE.DECISION,
    decision: 'D2',
    accionAlEntrar: { descripcion: 'Desconectar equipos, bloquear accesos y notificar a FBI, CISA y Dpto. de Energía', rol: 'analista_ti' },
  },
  erradicacion: {
    orden: 4,
    nombre: 'Erradicación',
    tipo: STAGE_TYPE.DECISION,
    decision: 'D3',
    accionAlEntrar: { descripcion: 'Eliminar el malware, rotar credenciales y cerrar la vía de acceso (VPN sin MFA)', rol: 'analista_ti' },
  },
  analisis_forense: {
    orden: 4.5,
    nombre: 'Análisis forense',
    tipo: STAGE_TYPE.ACTION,
    siguiente: 'erradicacion',
    esReintento: true,
  },
  recuperacion: {
    orden: 5,
    nombre: 'Recuperación',
    tipo: STAGE_TYPE.DECISION,
    decision: 'D4',
    efectoAlEntrar: SERVICE_EFFECT.START_RECOVERY,
  },
  ruta_alternativa: {
    orden: 5.5,
    nombre: 'Ruta alternativa',
    tipo: STAGE_TYPE.ACTION,
    siguiente: 'servicio_restablecido',
  },
  servicio_restablecido: {
    orden: 6,
    nombre: 'Servicio restablecido',
    tipo: STAGE_TYPE.ACTION,
    siguiente: 'cierre',
    efectoAlEntrar: SERVICE_EFFECT.RESTORE_ALL,
    accionAlEntrar: { descripcion: 'Verificar normalización de entregas en todos los tramos', rol: 'operador_ot' },
  },
  cierre: {
    orden: 7,
    nombre: 'Cierre',
    tipo: STAGE_TYPE.ACTION,
    siguiente: 'finalizado',
    requiereLecciones: true,
    accionAlEntrar: { descripcion: 'Documentar lecciones aprendidas: MFA, segmentación TI/OT, plan de continuidad y simulacros', rol: 'coordinador' },
  },
  finalizado: {
    orden: 8,
    nombre: 'Finalizado',
    tipo: STAGE_TYPE.FINAL,
  },
});

export const DECISIONS = Object.freeze({
  D1: {
    etapa: 'evaluacion',
    pregunta: '¿El ataque puede propagarse a los sistemas OT?',
    si: {
      destino: 'contencion',
      accion: { descripcion: 'Detener preventivamente el oleoducto y aislar las redes TI / OT', rol: 'operador_ot' },
      efecto: SERVICE_EFFECT.STOP_OT,
    },
    no: {
      destino: 'contencion',
      accion: { descripcion: 'Mantener la operación con monitoreo reforzado y contener solo los equipos de TI', rol: 'operador_ot' },
    },
  },
  D2: {
    etapa: 'contencion',
    pregunta: '¿Existen respaldos limpios y verificados?',
    si: {
      destino: 'erradicacion',
      accion: { descripcion: 'Restaurar los sistemas desde copias de seguridad', rol: 'analista_ti' },
    },
    no: {
      destino: 'erradicacion',
      accion: { descripcion: 'Evaluar con asesoría legal y autoridades el pago del rescate y el uso de la herramienta de descifrado', rol: 'legal' },
    },
  },
  D3: {
    etapa: 'erradicacion',
    pregunta: '¿Sistemas seguros y validados para reiniciar?',
    si: {
      destino: 'recuperacion',
      accion: { descripcion: 'Reinicio progresivo y manual del oleoducto por tramos', rol: 'operador_ot' },
    },
    no: {
      destino: 'analisis_forense',
      accion: { descripcion: 'Análisis forense y corrección adicional', rol: 'analista_ti' },
      cuentaComoIntentoFallido: true,
    },
  },
  D4: {
    etapa: 'recuperacion',
    pregunta: '¿Hay riesgo de desabastecimiento de combustible?',
    si: {
      destino: 'ruta_alternativa',
      accion: { descripcion: 'Transporte por camiones, coordinación con el gobierno, exenciones regulatorias y comunicación pública', rol: 'comunicaciones' },
    },
    no: {
      destino: 'servicio_restablecido',
    },
  },
});

export const INITIAL_STAGE = 'deteccion';

export function getStage(stageKey) {
  const stage = STAGES[stageKey];
  if (!stage) throw new Error(`Etapa desconocida: ${stageKey}`);
  return stage;
}

export function getBranch(decisionCode, answer) {
  const decision = DECISIONS[decisionCode];
  if (!decision) throw new Error(`Decisión desconocida: ${decisionCode}`);
  return answer ? decision.si : decision.no;
}

/** Definición serializable para que el cliente dibuje el flujo sin duplicar reglas. */
export function describeFlow() {
  return {
    etapas: Object.entries(STAGES).map(([clave, etapa]) => ({
      clave,
      nombre: etapa.nombre,
      orden: etapa.orden,
      tipo: etapa.tipo,
      decision: etapa.decision ?? null,
      esReintento: Boolean(etapa.esReintento),
    })),
    decisiones: Object.entries(DECISIONS).map(([codigo, d]) => ({
      codigo,
      etapa: d.etapa,
      pregunta: d.pregunta,
      si: { destino: d.si.destino, accion: d.si.accion?.descripcion ?? null },
      no: { destino: d.no.destino, accion: d.no.accion?.descripcion ?? null },
    })),
    maxIntentosErradicacion: MAX_ERADICATION_ATTEMPTS,
  };
}
