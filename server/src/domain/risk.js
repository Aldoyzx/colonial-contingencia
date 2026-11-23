/**
 * Riesgo de un activo en una escala de 0 a 1, pintada en 6 niveles de calor (0 verde … 5 rojo)
 * igual que el mapa de calor del proyecto Rack · Operación. Cada factor es visible en la
 * interfaz para que la cifra se pueda explicar y discutir.
 */
export const RISK_FACTORS = Object.freeze({
  criticidad: { peso: 0.4, etiqueta: 'Criticidad del activo' },
  expuesto: { peso: 0.2, etiqueta: 'Expuesto a Internet' },
  sinMfa: { peso: 0.2, etiqueta: 'Acceso solo con contraseña (sin MFA)' },
  sinSoporte: { peso: 0.1, etiqueta: 'Software fuera de soporte' },
  privilegiado: { peso: 0.1, etiqueta: 'Guarda credenciales o control privilegiado' },
  afectado: { peso: 0.35, etiqueta: 'Su servicio está afectado' },
  enRecuperacion: { peso: 0.15, etiqueta: 'Su servicio está en recuperación' },
});

/** Desde este puntaje el activo está en rojo y se aísla automáticamente si su servicio cae. */
export const ISOLATION_THRESHOLD = 0.8;
export const HEAT_LEVELS = 5;

/** Nivel de calor 0–5: 0 sin riesgo; luego un nivel por cada 20 %. */
export function heatLevel(score) {
  if (!(score > 0)) return 0;
  return Math.min(HEAT_LEVELS, Math.max(1, Math.ceil(score * HEAT_LEVELS - 1e-9)));
}

/**
 * @param {object} asset fila de activos (criticidad, expuesto_internet, sin_mfa, sin_soporte, privilegiado, aislado)
 * @param {string|null} serviceState estado del servicio que soporta (null = infraestructura base)
 */
export function assessRisk(asset, serviceState) {
  const factores = [];
  const add = (clave, aporte) => { if (aporte > 0) factores.push({ clave, etiqueta: RISK_FACTORS[clave].etiqueta, aporte: round(aporte) }); };

  add('criticidad', RISK_FACTORS.criticidad.peso * ((asset.criticidad - 1) / 4));
  // Aislar un activo lo desconecta: deja de contar su exposición, no su importancia.
  if (!asset.aislado) {
    if (asset.expuesto_internet) add('expuesto', RISK_FACTORS.expuesto.peso);
    if (asset.sin_mfa) add('sinMfa', RISK_FACTORS.sinMfa.peso);
  }
  if (asset.sin_soporte) add('sinSoporte', RISK_FACTORS.sinSoporte.peso);
  if (asset.privilegiado) add('privilegiado', RISK_FACTORS.privilegiado.peso);
  if (serviceState === 'afectado') add('afectado', RISK_FACTORS.afectado.peso);
  if (serviceState === 'en_recuperacion') add('enRecuperacion', RISK_FACTORS.enRecuperacion.peso);

  const score = Math.min(1, factores.reduce((sum, f) => sum + f.aporte, 0));
  return { puntaje: round(score), nivel: heatLevel(score), factores };
}

const round = (value) => Math.round(value * 1000) / 1000;
