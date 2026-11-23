import { useState } from 'react';
import { api } from '../../api.js';
import { LOCATION_TYPE_LABELS, SERVICE_STATE_LABELS } from '../../constants.js';
import { useAsync } from '../../useAsync.js';
import { ErrorBanner, Loading, ServiceStateBadge } from '../common.jsx';
import { heatColor } from './heat.jsx';

const POLL_MS = 15_000;
const WIDTH = 1200;
const MARGIN = 70;
const LINE_Y = 150;

const STATE_STROKE = { operativo: 'var(--ok)', afectado: 'var(--bad)', en_recuperacion: 'var(--amber)' };
const STATE_WEIGHT = { operativo: 0, en_recuperacion: 0.5, afectado: 1 };

/** Impacto en el suministro: estado del tramo × su criticidad, en la escala de calor de 0 a 5. */
function impactLevel(state, criticality = 5) {
  const score = (STATE_WEIGHT[state] ?? 0) * (criticality / 5);
  return score > 0 ? Math.min(5, Math.ceil(score * 5)) : 0;
}

const LAYERS = { estado: 'Estado del tramo', impacto: 'Impacto en el suministro' };

function stationShape(tipo, x, y, fill) {
  if (tipo === 'patio_tanques') return <rect x={x - 9} y={y - 9} width={18} height={18} rx={3} fill={fill} stroke="#fff" strokeWidth={3} />;
  if (tipo === 'terminal') return <polygon points={`${x},${y - 12} ${x + 12},${y} ${x},${y + 12} ${x - 12},${y}`} fill={fill} stroke="#fff" strokeWidth={3} />;
  return <circle cx={x} cy={y} r={9} fill={fill} stroke="#fff" strokeWidth={3} />;
}

export default function PipelineMap() {
  const { data, error, loading } = useAsync(() => api.pipelineMap(), [], { pollMs: POLL_MS });
  const [layer, setLayer] = useState('estado');
  const [selected, setSelected] = useState(null);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner error={error} />;

  const { instalaciones, tramos, centros, longitudKm } = data;
  const x = (km) => MARGIN + (km / longitudKm) * (WIDTH - MARGIN * 2);
  const byCode = Object.fromEntries(instalaciones.map((i) => [i.codigo, i]));
  const segmentColor = (t) => (layer === 'estado'
    ? STATE_STROKE[t.servicio_estado]
    : heatColor(impactLevel(t.servicio_estado, byCode[t.hasta].servicio_criticidad)));

  // Rótulo de cada tramo sobre el centro de sus segmentos.
  const groups = [];
  instalaciones.forEach((inst) => {
    const last = groups.at(-1);
    if (last?.servicio === inst.servicio_codigo) last.hasta = inst.km_aprox;
    else groups.push({ servicio: inst.servicio_codigo, nombre: inst.servicio_nombre, estado: inst.servicio_estado, desde: last ? last.hasta : inst.km_aprox, hasta: inst.km_aprox });
  });

  const current = selected ? instalaciones.find((i) => i.codigo === selected) ?? centros.find((c) => c.codigo === selected) : null;

  return (
    <div className="pipeline">
      <ErrorBanner error={error} />
      <div className="mapbar">
        <div className="segmented" role="group" aria-label="Capa del mapa">
          {Object.entries(LAYERS).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={layer === key}
              className={layer === key ? 'segmented__item segmented__item--active' : 'segmented__item'}
              onClick={() => setLayer(key)}>{label}</button>
          ))}
        </div>
        <span className="muted small">Esquema lineal de la línea principal Houston → Linden; distancias aproximadas.</span>
      </div>

      <div className="panel pipeline__canvas">
        <svg viewBox={`0 0 ${WIDTH} 260`} role="img" aria-label="Mapa de la red del oleoducto por tramos">
          {groups.map((g) => (
            <g key={g.servicio}>
              <text x={(x(g.desde) + x(g.hasta)) / 2} y={44} textAnchor="middle" className="pipeline__tramo">{g.nombre}</text>
              <text x={(x(g.desde) + x(g.hasta)) / 2} y={64} textAnchor="middle" className="pipeline__tramo-state" fill={STATE_STROKE[g.estado]}>
                {SERVICE_STATE_LABELS[g.estado]}
              </text>
            </g>
          ))}
          <line x1={x(0)} y1={LINE_Y} x2={x(longitudKm)} y2={LINE_Y} stroke="#dfe4ec" strokeWidth={22} strokeLinecap="round" />
          {tramos.map((t) => (
            <line key={`${t.desde}-${t.hasta}`} x1={x(byCode[t.desde].km_aprox)} y1={LINE_Y} x2={x(byCode[t.hasta].km_aprox)} y2={LINE_Y}
              stroke={segmentColor(t)} strokeWidth={14} strokeLinecap="round" />
          ))}
          {instalaciones.map((inst, i) => {
            const above = i % 2 === 0;
            const fill = layer === 'estado' ? STATE_STROKE[inst.servicio_estado] : heatColor(impactLevel(inst.servicio_estado, inst.servicio_criticidad));
            return (
              <g key={inst.codigo} className={`pipeline__station${selected === inst.codigo ? ' is-selected' : ''}`} tabIndex={0} role="button"
                aria-label={`${inst.nombre}, ${inst.ciudad} ${inst.estado_eeuu}`}
                onClick={() => setSelected(inst.codigo)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected(inst.codigo); }}>
                {stationShape(inst.tipo, x(inst.km_aprox), LINE_Y, fill)}
                <text x={x(inst.km_aprox)} y={above ? LINE_Y - 30 : LINE_Y + 42} textAnchor="middle" className="pipeline__name">{inst.nombre}</text>
                <text x={x(inst.km_aprox)} y={above ? LINE_Y - 14 : LINE_Y + 58} textAnchor="middle" className="pipeline__sub">{inst.estado_eeuu} · {inst.km_aprox} km</text>
              </g>
            );
          })}
        </svg>
        <ul className="pipeline__legend small">
          <li><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="var(--muted)" /></svg>Estación de bombeo</li>
          <li><svg width="16" height="16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2" fill="var(--muted)" /></svg>Patio de tanques</li>
          <li><svg width="16" height="16" aria-hidden="true"><polygon points="8,1 15,8 8,15 1,8" fill="var(--muted)" /></svg>Terminal</li>
        </ul>
      </div>

      <div className="pipeline__bottom">
        <div className="pipeline__centers">
          {centros.map((c) => (
            <button key={c.codigo} type="button" className={`center-card${selected === c.codigo ? ' is-selected' : ''}`} onClick={() => setSelected(c.codigo)}>
              <span className="center-card__type">{LOCATION_TYPE_LABELS[c.tipo]} · {c.ciudad}, {c.estado_eeuu}</span>
              <strong>{c.nombre}</strong>
              {c.servicio_codigo && <span>{c.servicio_codigo} <ServiceStateBadge estado={c.servicio_estado} /></span>}
              <span className="center-card__stats">{c.activos} activos · <b className={c.aislados ? 'text-bad' : ''}>{c.aislados} aislados</b> · {c.enRojo} en rojo</span>
            </button>
          ))}
        </div>
        <div className="panel pipeline__detail">
          {current ? (
            <>
              <span className="muted small">{LOCATION_TYPE_LABELS[current.tipo]}</span>
              <h3>{current.nombre}</h3>
              <p className="small">{current.ciudad}, {current.estado_eeuu}{current.km_aprox !== null && current.km_aprox !== undefined ? ` · km ${current.km_aprox} desde Houston (aprox.)` : ''}</p>
              <p className="small">{current.descripcion}</p>
              {current.servicio_codigo && (
                <p className="small"><b>{current.servicio_nombre}</b> <ServiceStateBadge estado={current.servicio_estado} />{current.servicio_nota ? ` · ${current.servicio_nota}` : ''}</p>
              )}
            </>
          ) : <p className="muted">Selecciona una instalación o un centro para ver su detalle.</p>}
        </div>
      </div>
    </div>
  );
}
