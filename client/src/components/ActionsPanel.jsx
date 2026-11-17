import { useState } from 'react';
import { ROLE_LABELS, formatDate, stageLabel } from '../constants.js';
import { ActionStateBadge } from './common.jsx';

const FINAL_STATES = ['completada', 'fallida'];

function ActionItem({ action, user, busy, onUpdate }) {
  const [closing, setClosing] = useState(null);
  const [resultado, setResultado] = useState('');

  const canEdit = !FINAL_STATES.includes(action.estado) &&
    (user.rol === 'coordinador' || user.id === action.responsable_id);

  const confirm = async () => {
    const ok = await onUpdate(action.id, { estado: closing, resultado: resultado.trim() || undefined });
    if (ok) {
      setClosing(null);
      setResultado('');
    }
  };

  return (
    <li className={`action action--${action.estado}`}>
      <div className="action__main">
        <p className="action__desc">{action.descripcion}</p>
        <p className="muted small">
          {stageLabel(action.etapa)} · {action.responsable_nombre} ({ROLE_LABELS[action.responsable_rol]}) · {formatDate(action.actualizada_en)}
        </p>
        {action.resultado && <p className="small action__result">Resultado: {action.resultado}</p>}
      </div>
      <div className="action__side">
        <ActionStateBadge estado={action.estado} />
        {canEdit && !closing && (
          <div className="action__buttons">
            {action.estado === 'pendiente' && (
              <button type="button" className="btn btn--sm" disabled={busy}
                onClick={() => onUpdate(action.id, { estado: 'en_progreso' })}>Iniciar</button>
            )}
            <button type="button" className="btn btn--sm btn--yes" disabled={busy} onClick={() => setClosing('completada')}>Completar</button>
            <button type="button" className="btn btn--sm btn--no" disabled={busy} onClick={() => setClosing('fallida')}>Falló</button>
          </div>
        )}
      </div>
      {closing && (
        <div className="action__close">
          <input
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            maxLength={1000}
            placeholder={closing === 'fallida' ? 'Motivo de la falla (obligatorio)' : 'Resultado (opcional)'}
            autoFocus
          />
          <button type="button" className="btn btn--sm btn--primary" onClick={confirm}
            disabled={busy || (closing === 'fallida' && !resultado.trim())}>Confirmar</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setClosing(null)}>Cancelar</button>
        </div>
      )}
    </li>
  );
}

function NewActionForm({ users, busy, onCreate }) {
  const [descripcion, setDescripcion] = useState('');
  const [responsableId, setResponsableId] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const ok = await onCreate({ descripcion: descripcion.trim(), responsableId: Number(responsableId) });
    if (ok) {
      setDescripcion('');
      setResponsableId('');
    }
  };

  return (
    <form className="new-action" onSubmit={submit}>
      <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500}
        placeholder="Nueva acción en la etapa actual" />
      <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
        <option value="">Responsable…</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
      </select>
      <button type="submit" className="btn btn--sm btn--primary"
        disabled={busy || descripcion.trim().length < 5 || !responsableId}>Asignar</button>
    </form>
  );
}

export default function ActionsPanel({ incident, users, user, busy, onUpdate, onCreate }) {
  const ordered = [...incident.acciones].reverse();
  const isOpen = incident.estado === 'abierto';

  return (
    <section className="panel">
      <header className="panel__head">
        <h3>Acciones de respuesta</h3>
        <span className="muted small">{incident.acciones.length} en total</span>
      </header>
      {isOpen && <NewActionForm users={users} busy={busy} onCreate={onCreate} />}
      <ul className="actions">
        {ordered.map((a) => <ActionItem key={a.id} action={a} user={user} busy={busy} onUpdate={onUpdate} />)}
      </ul>
    </section>
  );
}
