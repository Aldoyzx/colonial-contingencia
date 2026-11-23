import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useAsync } from '../../useAsync.js';
import { ErrorBanner, Loading } from '../common.jsx';
import AssetDetail from './AssetDetail.jsx';
import { HeatLegend, LAYERS, assetColor } from './heat.jsx';

const POLL_MS = 15_000;
const ROW_PX = 13;

function RackColumn({ rack, layer, selectedId, matches, onSelect }) {
  const height = rack.unidades * ROW_PX;
  return (
    <section className="rack" aria-label={`Rack ${rack.codigo}: ${rack.nombre}`}>
      <header className="rack__head">
        <strong>{rack.codigo}</strong>
        <span>{rack.nombre}</span>
        <small className="muted">{rack.ubicacion?.nombre}</small>
      </header>
      <div className="rack__body">
        <ol className="rack__units" style={{ height }} aria-hidden="true">
          {Array.from({ length: rack.unidades }, (_, i) => rack.unidades - i).map((u) => (
            <li key={u}>{u % 5 === 0 ? u : ''}</li>
          ))}
        </ol>
        <div className="rack__frame" style={{ height }}>
          {rack.activos.map((a) => {
            const { background, ink } = assetColor(a, layer);
            const top = (rack.unidades - (a.u_inicio + a.u_alto - 1)) * ROW_PX;
            const classes = ['rack__asset'];
            if (a.aislado) classes.push('is-isolated');
            if (a.id === selectedId) classes.push('is-selected');
            if (!matches(a)) classes.push('is-dim');
            return (
              <button key={a.id} type="button" className={classes.join(' ')}
                style={{ top, height: a.u_alto * ROW_PX - 2, background, color: ink }}
                onClick={() => onSelect(a.id)}
                title={`${a.codigo} · ${a.nombre} · riesgo ${Math.round(a.riesgo.puntaje * 100)}%${a.aislado ? ' · AISLADO' : ''}`}
                aria-label={`${a.codigo}, ${a.nombre}, U${a.u_inicio}${a.u_alto > 1 ? `–${a.u_inicio + a.u_alto - 1}` : ''}${a.aislado ? ', aislado' : ''}`}>
                <span className="rack__code">{a.codigo}</span>
                {a.aislado && <span className="rack__lock" aria-hidden="true">⛔</span>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function RackMap({ user, onStartRound }) {
  const { data, error, loading, reload } = useAsync(() => api.dataCenterMap(), [], { pollMs: POLL_MS });
  const [layer, setLayer] = useState('riesgo');
  const [red, setRed] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (a) => (!red || a.red === red)
      && (!q || [a.codigo, a.nombre, a.plataforma, a.servicio_codigo].some((v) => v?.toLowerCase().includes(q)));
  }, [red, query]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner error={error} />;

  const { resumen, racks } = data;
  const allAssets = racks.flatMap((r) => r.activos);
  const selected = allAssets.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="rackmap">
      <ErrorBanner error={error} />
      <section className="kpis kpis--5" aria-label="Resumen de activos">
        <div className="kpi"><span className="kpi__label">Activos</span><span className="kpi__value">{resumen.total}</span><span className="kpi__sub">en {racks.length} racks</span></div>
        <div className="kpi kpi--afectado"><span className="kpi__label">En rojo</span><span className="kpi__value">{resumen.enRojo}</span><span className="kpi__sub">riesgo ≥ {Math.round(data.umbralAislamiento * 100)}%</span></div>
        <div className="kpi kpi--isolated"><span className="kpi__label">Aislados</span><span className="kpi__value">{resumen.aislados}</span><span className="kpi__sub">desconectados de la red</span></div>
        <div className="kpi kpi--operativo"><span className="kpi__label">Listos para reconectar</span><span className="kpi__value">{resumen.listosParaReconectar}</span><span className="kpi__sub">verificados tras aislar</span></div>
        <div className="kpi kpi--en_recuperacion"><span className="kpi__label">Sin verificar</span><span className="kpi__value">{resumen.sinVerificar}</span><span className="kpi__sub">nunca pasaron una ronda</span></div>
      </section>

      <div className="mapbar">
        <div className="segmented" role="group" aria-label="Capa del mapa">
          {Object.entries(LAYERS).map(([key, l]) => (
            <button key={key} type="button" aria-pressed={layer === key}
              className={layer === key ? 'segmented__item segmented__item--active' : 'segmented__item'}
              onClick={() => setLayer(key)}>{l.label}</button>
          ))}
        </div>
        <label className="mapbar__field">Red
          <select value={red} onChange={(e) => setRed(e.target.value)}>
            <option value="">TI y OT</option><option value="TI">TI</option><option value="OT">OT</option>
          </select>
        </label>
        <label className="mapbar__field mapbar__search">Buscar
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Código, sistema o servicio" maxLength={40} />
        </label>
        {resumen.aislados > 0 && (
          <button type="button" className="btn btn--sm btn--warning" onClick={() => onStartRound({ alcance: 'aislados' })}>
            Verificar los {resumen.aislados} aislados
          </button>
        )}
      </div>

      <div className="rackmap__grid">
        <div className="rackmap__racks">
          {racks.map((rack) => (
            <RackColumn key={rack.codigo} rack={rack} layer={layer} selectedId={selectedId} matches={matches} onSelect={setSelectedId} />
          ))}
        </div>
        <aside className="rackmap__side">
          <HeatLegend layer={layer} />
          {selected ? (
            <AssetDetail key={selected.id} asset={selected} user={user} onChanged={reload} onClose={() => setSelectedId(null)} onStartRound={onStartRound} />
          ) : (
            <div className="panel"><p className="muted">Selecciona un equipo del rack para ver su riesgo, aislarlo o reconectarlo.</p></div>
          )}
        </aside>
      </div>
      <p className="muted small">Inventario de referencia con plataformas típicas de un operador de oleoductos; el inventario real de Colonial no es público.</p>
    </div>
  );
}
