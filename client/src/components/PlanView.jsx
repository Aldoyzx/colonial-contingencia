import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { RESOURCE_CATEGORY_LABELS, ROLE_LABELS, STAGE_TYPE_LABELS, stageLabel } from '../constants.js';
import { useAsync } from '../useAsync.js';
import { ErrorBanner, Loading } from './common.jsx';

const TABS = [
  { key: 'procedimiento', label: 'Procedimiento por etapa' },
  { key: 'recursos', label: 'Recursos tecnológicos' },
];

function DecisionBranches({ decision }) {
  return (
    <div className="plan-decision">
      <p><span className="decision-chip">{decision.codigo}</span> <strong>{decision.pregunta}</strong></p>
      <div className="plan-decision__branches">
        <div className="branch branch--yes">
          <strong>Sí → {stageLabel(decision.destinoSi)}</strong>
          {decision.accionSi && <span>{decision.accionSi}</span>}
        </div>
        <div className="branch branch--no">
          <strong>No → {stageLabel(decision.destinoNo)}</strong>
          {decision.accionNo && <span>{decision.accionNo}</span>}
        </div>
      </div>
    </div>
  );
}

function StageCard({ etapa }) {
  return (
    <article className={`plan-stage plan-stage--${etapa.tipo}${etapa.es_reintento ? ' plan-stage--retry' : ''}`}>
      <div className="plan-stage__order" aria-hidden="true">{Number.isInteger(etapa.orden) ? etapa.orden : '↺'}</div>
      <div className="plan-stage__body">
        <header className="plan-stage__head">
          <h3>{etapa.nombre}</h3>
          <span className={`badge ${etapa.tipo === 'decision' ? 'badge--decision' : 'badge--neutral'}`}>
            {etapa.es_reintento ? 'Reintento' : STAGE_TYPE_LABELS[etapa.tipo]}
          </span>
        </header>
        <p>{etapa.procedimiento}</p>
        {etapa.decision && <DecisionBranches decision={etapa.decision} />}
        <dl className="plan-stage__meta">
          <div>
            <dt>Responsable</dt>
            <dd>{etapa.responsable_nombre} <span className="muted">· {ROLE_LABELS[etapa.rol_responsable]}</span></dd>
          </div>
          <div>
            <dt>Recursos</dt>
            <dd className="chips">
              {etapa.recursos.map((r) => (
                <span key={r.codigo} className={`chip chip--${r.categoria}`} title={RESOURCE_CATEGORY_LABELS[r.categoria]}>
                  {r.codigo} {r.nombre}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function ResourcesTable({ recursos }) {
  const [categoria, setCategoria] = useState('');
  const visible = useMemo(
    () => (categoria ? recursos.filter((r) => r.categoria === categoria) : recursos),
    [recursos, categoria]
  );

  return (
    <section className="panel table-wrap">
      <header className="panel__head">
        <h3>Recursos tecnológicos ({visible.length})</h3>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Filtrar por categoría">
          <option value="">Todas las categorías</option>
          {Object.entries(RESOURCE_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </header>
      <table className="table">
        <thead>
          <tr><th>Código</th><th>Recurso</th><th>Categoría</th><th>Para qué sirve</th><th>Etapas</th></tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.codigo}>
              <td><strong>{r.codigo}</strong></td>
              <td>{r.nombre}</td>
              <td><span className={`chip chip--${r.categoria}`}>{RESOURCE_CATEGORY_LABELS[r.categoria]}</span></td>
              <td className="muted">{r.descripcion}</td>
              <td className="small">{r.etapas.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function PlanView() {
  const { data, error, loading } = useAsync(() => api.plan(), []);
  const [tab, setTab] = useState('procedimiento');

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner error={error} />;

  return (
    <div className="plan">
      <div className="page-head">
        <div>
          <h1>Plan de contingencia</h1>
          <p className="muted">Procedimiento, responsables y recursos de cada etapa, leídos de la base de datos.</p>
        </div>
        <div className="segmented" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              className={tab === t.key ? 'segmented__item segmented__item--active' : 'segmented__item'}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'procedimiento'
        ? <div className="plan__stages">{data.etapas.map((e) => <StageCard key={e.clave} etapa={e} />)}</div>
        : <ResourcesTable recursos={data.recursos} />}
    </div>
  );
}
