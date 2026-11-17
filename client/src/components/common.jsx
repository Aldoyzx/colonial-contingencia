import { useEffect, useRef, useState } from 'react';
import { ACTION_STATE_LABELS, SERVICE_STATE_LABELS, SEVERITY_LABELS } from '../constants.js';

export function ServiceStateBadge({ estado }) {
  return <span className={`badge badge--${estado}`}>{SERVICE_STATE_LABELS[estado] ?? estado}</span>;
}

export function ActionStateBadge({ estado }) {
  return <span className={`badge badge--action-${estado}`}>{ACTION_STATE_LABELS[estado] ?? estado}</span>;
}

export function SeverityBadge({ severidad }) {
  return <span className={`badge badge--sev-${severidad}`}>{SEVERITY_LABELS[severidad] ?? severidad}</span>;
}

export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="alert alert--error" role="alert">
      <div>
        <strong>{error.message}</strong>
        {error.details?.length > 0 && (
          <ul>
            {error.details.map((d) => (
              <li key={`${d.campo}-${d.mensaje}`}>{d.campo}: {d.mensaje}</li>
            ))}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button type="button" className="alert__close" onClick={onDismiss} aria-label="Cerrar">×</button>
      )}
    </div>
  );
}

export function Loading({ label = 'Cargando…' }) {
  return <p className="muted">{label}</p>;
}

export function Criticality({ value }) {
  return (
    <span className="criticality" title={`Criticidad ${value} de 5`} aria-label={`Criticidad ${value} de 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < value ? 'dot dot--on' : 'dot'} />
      ))}
    </span>
  );
}

export function SimulacroBadge({ show = true }) {
  if (!show) return null;
  return <span className="badge badge--simulacro" title="Ejercicio de práctica, no es un incidente real">Simulacro</span>;
}

/**
 * Diálogo modal accesible (elemento nativo <dialog>): bloquea el fondo, gestiona el foco
 * y se cierra con Esc. Reemplaza a window.prompt, que no permite validar ni dar estilo.
 */
export function NoteDialog({ open, title, description, maxLength = 300, required = false, minLength = 1, label = 'Nota', confirmLabel = 'Confirmar', onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setValue('');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const trimmed = value.trim();
  const invalid = required && trimmed.length < minLength;

  const submit = (e) => {
    e.preventDefault();
    if (!invalid) onConfirm(trimmed || undefined);
  };

  return (
    <dialog ref={dialogRef} className="dialog" onCancel={(e) => { e.preventDefault(); onCancel(); }} aria-labelledby="note-dialog-title">
      <form method="dialog" onSubmit={submit} className="dialog__body">
        <h3 id="note-dialog-title">{title}</h3>
        {description && <p className="muted small">{description}</p>}
        <label className="field">
          <span>{label} {required ? (minLength > 1 ? `(mínimo ${minLength} caracteres)` : '(obligatoria)') : '(opcional)'}</span>
          <textarea rows={3} value={value} maxLength={maxLength} onChange={(e) => setValue(e.target.value)} autoFocus
            placeholder="Ej.: SCADA validado por el operador de turno" />
          <small className="muted">{value.length}/{maxLength}</small>
        </label>
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={invalid}>{confirmLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
