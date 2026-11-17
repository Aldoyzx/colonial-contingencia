import { useState } from 'react';
import { api } from '../api.js';
import { EVENT_LABELS, formatDate, stageLabel } from '../constants.js';
import { useAsync } from '../useAsync.js';
import ActionsPanel from './ActionsPanel.jsx';
import { ErrorBanner, Loading, ServiceStateBadge, SeverityBadge } from './common.jsx';
import FlowStepper from './FlowStepper.jsx';
import NextStepPanel from './NextStepPanel.jsx';

export default function IncidentDetail({ id, users, user, onBack }) {
  const { data: incident, error, loading, setData } = useAsync(() => api.incident(id), [id]);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState(null);

  /** Ejecuta una mutación y recarga el detalle; devuelve true si tuvo éxito. */
  const run = async (mutation) => {
    setBusy(true);
    setMutationError(null);
    try {
      const result = await mutation();
      setData(result?.siguientePaso ? result : await api.incident(id));
      return true;
    } catch (err) {
      setMutationError(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading && !incident) return <Loading />;
  if (!incident) return <ErrorBanner error={error} />;

  return (
    <div className="detail">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>← Incidentes</button>

      <div className="page-head">
        <div>
          <p className="muted small">{incident.codigo} · detectado {formatDate(incident.detectado_en)}</p>
          <h1>{incident.titulo}</h1>
          <p>{incident.descripcion}</p>
        </div>
        <div className="detail__meta">
          <SeverityBadge severidad={incident.severidad} />
          <span className={`badge ${incident.estado === 'cerrado' ? 'badge--operativo' : 'badge--neutral'}`}>
            {incident.estado === 'cerrado' ? 'Cerrado' : stageLabel(incident.etapa)}
          </span>
          <span className="muted small">Responsable: {incident.responsable.nombre}</span>
        </div>
      </div>

      <FlowStepper etapa={incident.etapa} decisiones={incident.decisiones} intentos={incident.intentos_erradicacion} />

      <ErrorBanner error={mutationError} onDismiss={() => setMutationError(null)} />

      <div className="detail__grid">
        <div className="detail__main">
          <NextStepPanel
            incident={incident}
            user={user}
            busy={busy}
            onDecide={(respuesta, justificacion) => run(() => api.decide(id, { respuesta, justificacion }))}
            onAdvance={(payload) => run(() => api.advance(id, payload))}
          />
          <ActionsPanel
            incident={incident}
            users={users}
            user={user}
            busy={busy}
            onUpdate={(actionId, payload) => run(() => api.updateAction(actionId, payload))}
            onCreate={(payload) => run(() => api.createAction(id, payload))}
          />
        </div>

        <aside className="detail__side">
          <section className="panel">
            <header className="panel__head"><h3>Servicios vinculados</h3></header>
            <ul className="linked-services">
              {incident.servicios.map((s) => (
                <li key={s.id}>
                  <span><strong>{s.codigo}</strong> {s.nombre}</span>
                  <ServiceStateBadge estado={s.estado} />
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <header className="panel__head"><h3>Decisiones</h3></header>
            {incident.decisiones.length === 0 ? (
              <p className="muted">Aún no se tomaron decisiones.</p>
            ) : (
              <ul className="decisions">
                {incident.decisiones.map((d) => (
                  <li key={d.id}>
                    <span className="decision-chip">{d.codigo}</span>
                    <span className={d.respuesta ? 'answer answer--yes' : 'answer answer--no'}>{d.respuesta ? 'Sí' : 'No'}</span>
                    <p className="small">{d.pregunta}</p>
                    <p className="muted small">{d.justificacion} — {d.usuario_nombre}, {formatDate(d.tomada_en)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <header className="panel__head"><h3>Historial de recuperación</h3></header>
            <ol className="timeline">
              {incident.historial.map((h) => (
                <li key={h.id} className={`timeline__item timeline__item--${h.evento}`}>
                  <span className="timeline__title">{EVENT_LABELS[h.evento] ?? h.evento}</span>
                  {h.servicio_nombre && <span className="small">{h.servicio_nombre}: {h.estado_anterior} → {h.estado_nuevo}</span>}
                  {!h.servicio_nombre && h.detalle && <span className="small">{h.detalle}</span>}
                  <span className="muted small">{formatDate(h.fecha)} · {h.usuario_nombre}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
