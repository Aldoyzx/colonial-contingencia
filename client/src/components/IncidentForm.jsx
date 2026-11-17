import { useState } from 'react';
import { api } from '../api.js';
import { ROLE_LABELS, SEVERITY_LABELS } from '../constants.js';
import { useAsync } from '../useAsync.js';
import { ErrorBanner, Loading, ServiceStateBadge } from './common.jsx';

const INITIAL_FORM = {
  titulo: '',
  descripcion: '',
  severidad: 'alta',
  responsableId: '',
  servicioIds: [],
  esSimulacro: false,
};

function validate(form) {
  const errors = {};
  if (form.titulo.trim().length < 5) errors.titulo = 'Mínimo 5 caracteres';
  if (form.descripcion.trim().length < 10) errors.descripcion = 'Mínimo 10 caracteres';
  if (!form.responsableId) errors.responsableId = 'Selecciona un responsable';
  if (form.servicioIds.length === 0) errors.servicioIds = 'Selecciona al menos un servicio afectado';
  return errors;
}

export default function IncidentForm({ users, currentUser, onCreated }) {
  const { data: services, error: loadError, loading } = useAsync(() => api.services(), []);
  const [form, setForm] = useState({ ...INITIAL_FORM, responsableId: String(currentUser.id) });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const toggleService = (id) => setForm((f) => ({
    ...f,
    servicioIds: f.servicioIds.includes(id) ? f.servicioIds.filter((s) => s !== id) : [...f.servicioIds, id],
  }));

  const submit = async (e) => {
    e.preventDefault();
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await api.createIncident({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        severidad: form.severidad,
        responsableId: Number(form.responsableId),
        servicioIds: form.servicioIds,
        esSimulacro: form.esSimulacro,
      });
      onCreated(created.id);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <form className="panel form" onSubmit={submit} noValidate>
      <h1>Registrar incidente</h1>
      <p className="muted">Inicia el plan de contingencia en la etapa de <strong>Detección</strong>.</p>

      <ErrorBanner error={loadError ?? submitError} onDismiss={() => setSubmitError(null)} />

      <label className="field">
        <span>Título</span>
        <input value={form.titulo} onChange={update('titulo')} maxLength={120} placeholder="Ransomware en servidores de facturación" />
        {fieldErrors.titulo && <small className="field__error">{fieldErrors.titulo}</small>}
      </label>

      <label className="field">
        <span>Descripción</span>
        <textarea rows={4} value={form.descripcion} onChange={update('descripcion')} maxLength={2000}
          placeholder="Qué se detectó, dónde y cuándo" />
        {fieldErrors.descripcion && <small className="field__error">{fieldErrors.descripcion}</small>}
      </label>

      <div className="form__row">
        <label className="field">
          <span>Severidad</span>
          <select value={form.severidad} onChange={update('severidad')}>
            {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Responsable del incidente</span>
          <select value={form.responsableId} onChange={update('responsableId')}>
            <option value="">Selecciona…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre} — {ROLE_LABELS[u.rol]}</option>
            ))}
          </select>
          {fieldErrors.responsableId && <small className="field__error">{fieldErrors.responsableId}</small>}
        </label>
      </div>

      <fieldset className="field">
        <legend>Servicios afectados</legend>
        <div className="checklist">
          {services?.map((s) => (
            <label key={s.id} className="checklist__item">
              <input type="checkbox" checked={form.servicioIds.includes(s.id)} onChange={() => toggleService(s.id)} />
              <span className="checklist__text">
                <strong>{s.codigo}</strong> {s.nombre}
              </span>
              <ServiceStateBadge estado={s.estado} />
            </label>
          ))}
        </div>
        {fieldErrors.servicioIds && <small className="field__error">{fieldErrors.servicioIds}</small>}
      </fieldset>

      <label className="toggle">
        <input type="checkbox" checked={form.esSimulacro}
          onChange={(e) => setForm((f) => ({ ...f, esSimulacro: e.target.checked }))} />
        <span>
          <strong>Es un simulacro</strong>
          <small className="muted"> — ejercicio para ensayar el plan; se identifica en todo el sistema.</small>
        </span>
      </label>

      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Registrando…' : form.esSimulacro ? 'Iniciar simulacro' : 'Registrar incidente'}
        </button>
      </div>
    </form>
  );
}
