import { useState } from 'react';
import { api } from '../api.js';
import { EVIDENCE_CATEGORY, formatBytes } from '../constants.js';
import { useAsync } from '../useAsync.js';
import { ErrorBanner, Loading } from './common.jsx';
import { EvidenceCard, EvidenceViewer } from './evidence.jsx';

/** Biblioteca multimedia: todas las evidencias, filtrables por categoría. */
export default function EvidenceLibrary({ user, onOpenIncident }) {
  const [categoria, setCategoria] = useState('');
  const [incluirAnuladas, setIncluirAnuladas] = useState(false);
  const { data, error, loading, reload } = useAsync(() => api.evidenceLibrary({ categoria, incluirAnuladas }), [categoria, incluirAnuladas]);
  const [selected, setSelected] = useState(null);

  const totals = data?.totales ?? [];
  const totalCount = totals.reduce((s, t) => s + t.cantidad, 0);
  const totalBytes = totals.reduce((s, t) => s + Number(t.bytes), 0);

  return (
    <div className="library">
      <div className="page-head">
        <div>
          <h1>Biblioteca de evidencias</h1>
          <p className="muted">{totalCount} archivos vigentes · {formatBytes(totalBytes)} almacenados</p>
        </div>
        <label className="toggle-inline">
          <input type="checkbox" checked={incluirAnuladas} onChange={(e) => setIncluirAnuladas(e.target.checked)} /> Incluir anuladas
        </label>
      </div>

      <div className="category-filter" role="tablist" aria-label="Filtrar por categoría">
        <button type="button" role="tab" aria-selected={categoria === ''} className={categoria === '' ? 'cat-chip cat-chip--active' : 'cat-chip'} onClick={() => setCategoria('')}>
          Todas <span>{totalCount}</span>
        </button>
        {Object.entries(EVIDENCE_CATEGORY).map(([key, label]) => {
          const t = totals.find((x) => x.categoria === key);
          return (
            <button key={key} type="button" role="tab" aria-selected={categoria === key} className={categoria === key ? `cat-chip cat-chip--active cat-chip--${key}` : `cat-chip cat-chip--${key}`} onClick={() => setCategoria(key)}>
              {label} <span>{t?.cantidad ?? 0}</span>
            </button>
          );
        })}
      </div>

      <ErrorBanner error={error} />
      {loading && !data && <Loading />}
      {data && data.evidencias.length === 0 && <p className="muted panel">No hay evidencias con este filtro. Se cargan desde el detalle de cada incidente.</p>}
      {data && data.evidencias.length > 0 && (
        <div className="evidence-grid evidence-grid--library">
          {data.evidencias.map((e) => <EvidenceCard key={e.id} evidence={e} onOpen={setSelected} showIncident onOpenIncident={onOpenIncident} />)}
        </div>
      )}
      {selected && <EvidenceViewer evidence={selected} user={user} onClose={() => setSelected(null)} onChanged={(u) => { setSelected(u); reload(); }} />}
    </div>
  );
}
