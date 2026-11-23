import { HEAT_LABELS } from '../../constants.js';

/** Escala de calor del proyecto Rack: h0 verde … h5 rojo. Texto oscuro donde el fondo es claro. */
export const heatColor = (level) => `var(--h${level})`;
export const heatInk = (level) => (level === 1 || level === 2 ? 'var(--text)' : '#fff');

const STATE_COLORS = {
  aislado: { background: 'var(--isolated)', ink: '#fff' },
  afectado: { background: 'var(--bad)', ink: '#fff' },
  en_recuperacion: { background: 'var(--amber)', ink: 'var(--text)' },
  operativo: { background: 'var(--ok)', ink: '#fff' },
};

const VERIFICATION_COLORS = {
  ok: { background: 'var(--ok)', ink: '#fff' },
  observado: { background: 'var(--amber)', ink: 'var(--text)' },
  falla: { background: 'var(--bad)', ink: '#fff' },
  none: { background: '#c9d1dc', ink: 'var(--text)' },
};

export const LAYERS = {
  riesgo: { label: 'Riesgo' },
  estado: { label: 'Estado' },
  verificacion: { label: 'Verificación' },
};

export function assetColor(asset, layer) {
  if (layer === 'estado') return STATE_COLORS[asset.aislado ? 'aislado' : asset.servicio_estado ?? 'operativo'];
  if (layer === 'verificacion') return VERIFICATION_COLORS[asset.verificacion_resultado ?? 'none'];
  return { background: heatColor(asset.riesgo.nivel), ink: heatInk(asset.riesgo.nivel) };
}

const LEGENDS = {
  riesgo: HEAT_LABELS.map((label, level) => ({ label, color: heatColor(level) })),
  estado: [
    { label: 'Operativo', color: 'var(--ok)' },
    { label: 'Servicio afectado', color: 'var(--bad)' },
    { label: 'En recuperación', color: 'var(--amber)' },
    { label: 'Aislado', color: 'var(--isolated)' },
  ],
  verificacion: [
    { label: 'OK', color: 'var(--ok)' },
    { label: 'Observado', color: 'var(--amber)' },
    { label: 'Falla', color: 'var(--bad)' },
    { label: 'Sin verificar', color: '#c9d1dc' },
  ],
};

export function HeatLegend({ layer, title = 'Leyenda' }) {
  return (
    <div className="panel heat-legend">
      <h3>{title}</h3>
      <ul>
        {LEGENDS[layer].map((item) => (
          <li key={item.label}><i style={{ background: item.color }} />{item.label}</li>
        ))}
        {layer !== 'estado' && <li><i className="heat-legend__lock">⛔</i>Aislado</li>}
      </ul>
    </div>
  );
}

export function RiskMeter({ riesgo }) {
  return (
    <div className="risk-meter" role="meter" aria-valuenow={Math.round(riesgo.puntaje * 100)} aria-valuemin={0} aria-valuemax={100}
      aria-label={`Riesgo ${Math.round(riesgo.puntaje * 100)}%`}>
      <span style={{ width: `${Math.max(2, riesgo.puntaje * 100)}%`, background: heatColor(riesgo.nivel) }} />
    </div>
  );
}
