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
