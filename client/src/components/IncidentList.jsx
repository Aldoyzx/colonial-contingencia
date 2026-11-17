import { useState } from 'react';
import { api } from '../api.js';
import { formatDate, stageLabel } from '../constants.js';
import { useAsync } from '../useAsync.js';
import { ErrorBanner, Loading, SeverityBadge, SimulacroBadge } from './common.jsx';

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'abierto', label: 'Abiertos' },
  { value: 'cerrado', label: 'Cerrados' },
];

export default function IncidentList({ onOpen }) {
  const [estado, setEstado] = useState('');
  const { data, error, loading } = useAsync(() => api.incidents(estado), [estado]);

  return (
    <div>
      <div className="page-head">
        <h1>Incidentes</h1>
        <div className="segmented" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={estado === f.value}
              className={estado === f.value ? 'segmented__item segmented__item--active' : 'segmented__item'}
              onClick={() => setEstado(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorBanner error={error} />
      {loading && !data && <Loading />}

      {data && data.length === 0 && <p className="muted">No hay incidentes registrados.</p>}

      {data && data.length > 0 && (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Severidad</th>
                <th>Etapa</th>
                <th>Responsable</th>
                <th>Acciones abiertas</th>
                <th>Detectado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id} onClick={() => onOpen(i.id)} className="table__row--link">
                  <td><strong>{i.codigo}</strong> <SimulacroBadge show={i.es_simulacro} /></td>
                  <td>{i.titulo}</td>
                  <td><SeverityBadge severidad={i.severidad} /></td>
                  <td>{i.estado === 'cerrado' ? 'Cerrado' : stageLabel(i.etapa)}</td>
                  <td>{i.responsable_nombre}</td>
                  <td>{i.acciones_abiertas}</td>
                  <td>{formatDate(i.detectado_en)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
