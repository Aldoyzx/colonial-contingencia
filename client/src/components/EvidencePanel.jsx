import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../useAsync.js';
import { ErrorBanner } from './common.jsx';
import { EvidenceCard, EvidenceUploader, EvidenceViewer } from './evidence.jsx';

/** Evidencias de un incidente: carga, galería y visor. */
export default function EvidencePanel({ incident, user, onChanged }) {
  const { data, error, reload } = useAsync(() => api.incidentEvidence(incident.id), [incident.id]);
  const [selected, setSelected] = useState(null);
  const canUpload = user.rol === 'coordinador' || (incident.estado === 'abierto'
    && (incident.responsable_id === user.id || incident.acciones.some((a) => a.responsable_id === user.id)));
  const visible = (data ?? []).filter((e) => !e.anulada);
  const voided = (data ?? []).length - visible.length;

  const refresh = async () => {
    await reload();
    onChanged?.();
  };

  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h3>Evidencias multimedia</h3>
          <p className="muted small">Cada archivo guarda su huella SHA-256: cadena de custodia para el análisis forense y las autoridades.</p>
        </div>
        <span className="muted small">{visible.length} vigentes{voided ? ` · ${voided} anuladas` : ''}</span>
      </header>
      <ErrorBanner error={error} />
      {canUpload ? <EvidenceUploader incident={incident} onUploaded={refresh} /> : <p className="hint">Solo quienes participan en el incidente pueden cargar evidencias.</p>}
      {data && data.length > 0 && (
        <div className="evidence-grid">
          {data.map((e) => <EvidenceCard key={e.id} evidence={e} onOpen={setSelected} />)}
        </div>
      )}
      {data && data.length === 0 && <p className="muted">Aún no hay evidencias en este incidente.</p>}
      {selected && (
        <EvidenceViewer evidence={selected} user={user} onClose={() => setSelected(null)}
          onChanged={(updated) => { setSelected(updated); refresh(); }} />
      )}
    </section>
  );
}
