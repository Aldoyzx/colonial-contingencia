import { useState } from 'react';
import { stageLabel } from '../constants.js';

function DecisionForm({ step, canDecide, blocked, busy, onDecide }) {
  const [justificacion, setJustificacion] = useState('');
  const valid = justificacion.trim().length >= 5;

  return (
    <>
      <p className="next-step__question">
        <span className="decision-chip">{step.codigo}</span> {step.pregunta}
      </p>
      <div className="branches">
        <div className="branch branch--yes">
          <strong>Sí → {stageLabel(step.si.destino)}</strong>
          {step.si.accion && <p className="small">{step.si.accion}</p>}
        </div>
        <div className="branch branch--no">
          <strong>No → {stageLabel(step.no.destino)}</strong>
          {step.no.accion && <p className="small">{step.no.accion}</p>}
        </div>
      </div>
      <label className="field">
        <span>Justificación de la decisión</span>
        <textarea rows={2} value={justificacion} onChange={(e) => setJustificacion(e.target.value)}
          maxLength={1000} placeholder="Evidencia o criterio que respalda la decisión" disabled={!canDecide} />
      </label>
      {!canDecide && <p className="hint">Solo el coordinador de respuesta puede tomar decisiones.</p>}
      <div className="form__actions">
        <button type="button" className="btn btn--yes" disabled={!canDecide || !valid || busy || blocked}
          onClick={() => onDecide(true, justificacion.trim())}>Sí</button>
        <button type="button" className="btn btn--no" disabled={!canDecide || !valid || busy || blocked}
          onClick={() => onDecide(false, justificacion.trim())}>No</button>
      </div>
    </>
  );
}

function AdvanceForm({ step, canAdvance, blocked, busy, onAdvance }) {
  const [lecciones, setLecciones] = useState('');
  const label = step.esReintento
    ? 'Reintentar erradicación'
    : step.requiereLecciones
      ? 'Cerrar incidente'
      : `Avanzar a ${stageLabel(step.siguiente)}`;

  return (
    <>
      {step.requiereLecciones && (
        <label className="field">
          <span>Lecciones aprendidas (mín. 20 caracteres)</span>
          <textarea rows={4} value={lecciones} onChange={(e) => setLecciones(e.target.value)} maxLength={4000}
            placeholder="MFA obligatorio en VPN, segmentación TI/OT, simulacros trimestrales…" />
        </label>
      )}
      {!canAdvance && <p className="hint">Solo el coordinador o el responsable del incidente pueden avanzar.</p>}
      <div className="form__actions">
        <button
          type="button"
          className={step.esReintento ? 'btn btn--warning' : 'btn btn--primary'}
          disabled={!canAdvance || busy || blocked || (step.requiereLecciones && lecciones.trim().length < 20)}
          onClick={() => onAdvance(step.requiereLecciones ? { leccionesAprendidas: lecciones.trim() } : {})}
        >
          {label}
        </button>
      </div>
    </>
  );
}

export default function NextStepPanel({ incident, user, busy, onDecide, onAdvance }) {
  const step = incident.siguientePaso;
  const openInStage = incident.acciones.filter(
    (a) => a.etapa === incident.etapa && ['pendiente', 'en_progreso'].includes(a.estado)
  ).length;

  if (step.tipo === 'final') {
    return (
      <section className="panel next-step next-step--done">
        <h3>Incidente cerrado</h3>
        <p className="muted">{incident.lecciones_aprendidas}</p>
      </section>
    );
  }

  const isCoordinator = user.rol === 'coordinador';
  const canAdvance = isCoordinator || user.id === incident.responsable_id;

  return (
    <section className="panel next-step">
      <header className="panel__head">
        <h3>Siguiente paso · {stageLabel(incident.etapa)}</h3>
      </header>
      {openInStage > 0 && (
        <p className="alert alert--warning">
          Completa o marca como fallidas las {openInStage} acción(es) de esta etapa antes de continuar.
        </p>
      )}
      {step.tipo === 'decision' ? (
        <DecisionForm key={`${incident.etapa}-${incident.decisiones.length}`} step={step} canDecide={isCoordinator}
          blocked={openInStage > 0} busy={busy} onDecide={onDecide} />
      ) : (
        <AdvanceForm key={incident.etapa} step={step} canAdvance={canAdvance}
          blocked={openInStage > 0} busy={busy} onAdvance={onAdvance} />
      )}
    </section>
  );
}
