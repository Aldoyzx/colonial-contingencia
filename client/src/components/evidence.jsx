import { useEffect, useRef, useState } from 'react';
import { api, evidenceUrl } from '../api.js';
import { EVIDENCE_CATEGORY, formatBytes, formatDate, stageLabel } from '../constants.js';
import { ErrorBanner, NoteDialog } from './common.jsx';

const ICONS = { imagen: '🖼', documento: '📄', video: '🎬', audio: '🎧', registro: '📜' };

export function CategoryBadge({ categoria }) {
  return <span className={`badge badge--cat-${categoria}`}>{EVIDENCE_CATEGORY[categoria] ?? categoria}</span>;
}

/** Miniatura: la imagen real si es imagen; si no, el icono de su categoría. */
function Thumb({ evidence }) {
  if (evidence.categoria === 'imagen' && !evidence.anulada) {
    return <img className="evidence-card__thumb" src={evidenceUrl(evidence.id)} alt={evidence.nombre_original} loading="lazy" />;
  }
  return <div className={`evidence-card__thumb evidence-card__thumb--icon evidence-card__thumb--${evidence.categoria}`} aria-hidden="true">{ICONS[evidence.categoria]}</div>;
}

export function EvidenceCard({ evidence, onOpen, showIncident = false, onOpenIncident }) {
  return (
    <article className={`evidence-card${evidence.anulada ? ' evidence-card--void' : ''}`}>
      <button type="button" className="evidence-card__preview" onClick={() => onOpen(evidence)} aria-label={`Ver ${evidence.nombre_original}`}>
        <Thumb evidence={evidence} />
      </button>
      <div className="evidence-card__body">
        <div className="evidence-card__top">
          <CategoryBadge categoria={evidence.categoria} />
          {evidence.anulada && <span className="badge badge--afectado">Anulada</span>}
          {evidence.es_simulacro && <span className="badge badge--simulacro">Simulacro</span>}
        </div>
        <strong className="evidence-card__name" title={evidence.nombre_original}>{evidence.nombre_original}</strong>
        {evidence.descripcion && <p className="small">{evidence.descripcion}</p>}
        <p className="muted small">
          {formatBytes(evidence.tamano_bytes)} · {stageLabel(evidence.etapa)} · {evidence.subido_por_nombre}
        </p>
        <p className="muted small">{formatDate(evidence.subido_en)}</p>
        {showIncident && (
          <button type="button" className="link-button small" onClick={() => onOpenIncident(evidence.incidente_id)}>
            {evidence.incidente_codigo} · {evidence.incidente_titulo}
          </button>
        )}
      </div>
    </article>
  );
}

function TextPreview({ id }) {
  const [text, setText] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.evidenceText(id).then((t) => setText(t.slice(0, 50_000))).catch(setError);
  }, [id]);
  if (error) return <ErrorBanner error={error} />;
  return <pre className="viewer__text">{text ?? 'Cargando…'}</pre>;
}

function Preview({ evidence }) {
  const url = evidenceUrl(evidence.id);
  switch (evidence.categoria) {
    case 'imagen': return <img className="viewer__media" src={url} alt={evidence.nombre_original} />;
    case 'video': return <video className="viewer__media" src={url} controls preload="metadata" />;
    case 'audio': return <audio className="viewer__audio" src={url} controls preload="metadata" />;
    case 'documento': return <iframe className="viewer__pdf" src={url} title={evidence.nombre_original} />;
    default: return <TextPreview id={evidence.id} />;
  }
}

/** Visor modal: muestra el archivo, sus metadatos de custodia y las acciones disponibles. */
export function EvidenceViewer({ evidence, user, onClose, onChanged }) {
  const dialogRef = useRef(null);
  const [integrity, setIntegrity] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [error, setError] = useState(null);
  const canVoid = !evidence.anulada && (user.rol === 'coordinador' || user.id === evidence.subido_por);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const verify = async () => {
    setError(null);
    try { setIntegrity(await api.verifyEvidence(evidence.id)); } catch (err) { setError(err); }
  };

  const voidIt = async (motivo) => {
    setVoiding(false);
    setError(null);
    try {
      onChanged(await api.voidEvidence(evidence.id, motivo));
    } catch (err) {
      setError(err);
    }
  };

  return (
    <dialog ref={dialogRef} className="dialog viewer" onCancel={(e) => { e.preventDefault(); onClose(); }} aria-label={evidence.nombre_original}>
      <header className="viewer__head">
        <div>
          <CategoryBadge categoria={evidence.categoria} />
          <h3>{evidence.nombre_original}</h3>
        </div>
        <button type="button" className="alert__close" onClick={onClose} aria-label="Cerrar">×</button>
      </header>
      <div className="viewer__body">
        <div className="viewer__stage">
          {evidence.anulada ? <p className="muted">Evidencia anulada: el archivo se conserva para auditoría, pero no se muestra.</p> : <Preview evidence={evidence} />}
        </div>
        <aside className="viewer__meta">
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
          <dl>
            <dt>Incidente</dt><dd>{evidence.incidente_codigo}</dd>
            <dt>Etapa</dt><dd>{stageLabel(evidence.etapa)}</dd>
            {evidence.accion_descripcion && (<><dt>Acción</dt><dd>{evidence.accion_descripcion}</dd></>)}
            <dt>Tipo</dt><dd>{evidence.tipo_mime} · {formatBytes(evidence.tamano_bytes)}</dd>
            <dt>Cargada por</dt><dd>{evidence.subido_por_nombre} · {formatDate(evidence.subido_en)}</dd>
            <dt>Huella SHA-256</dt><dd><code className="hash">{evidence.sha256}</code></dd>
            {evidence.anulada && (<><dt>Anulada</dt><dd>{evidence.anulada_por_nombre} · {formatDate(evidence.anulada_en)}<br />{evidence.motivo_anulacion}</dd></>)}
          </dl>
          {integrity && (
            <div className={`alert ${integrity.integra ? 'alert--success' : 'alert--error'}`} role="status">
              {integrity.integra ? '✔ Íntegra: la huella actual coincide con la registrada al cargarla.' : '✘ ¡Alterada! La huella actual no coincide.'}
            </div>
          )}
          <div className="viewer__actions">
            {!evidence.anulada && <a className="btn btn--primary" href={evidenceUrl(evidence.id, { download: true })}>Descargar</a>}
            {!evidence.anulada && <button type="button" className="btn btn--ghost" onClick={verify}>Verificar integridad</button>}
            {canVoid && <button type="button" className="btn btn--ghost btn--danger" onClick={() => setVoiding(true)}>Anular</button>}
          </div>
        </aside>
      </div>
      {voiding && (
        <NoteDialog open title={`Anular ${evidence.nombre_original}`} description="Las evidencias no se borran: quedan anuladas con su motivo en la bitácora."
          required minLength={10} label="Motivo" confirmLabel="Anular evidencia" onConfirm={voidIt} onCancel={() => setVoiding(false)} />
      )}
    </dialog>
  );
}

/** Zona de carga con arrastrar y soltar; valida tamaño y extensión antes de enviar. */
export function EvidenceUploader({ incident, onUploaded }) {
  const [config, setConfig] = useState(null);
  const [file, setFile] = useState(null);
  const [descripcion, setDescripcion] = useState('');
  const [accionId, setAccionId] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { api.evidenceConfig().then(setConfig).catch(setError); }, []);

  const pick = (candidate) => {
    setError(null);
    if (!candidate || !config) return;
    const ext = `.${candidate.name.split('.').pop().toLowerCase()}`;
    if (!config.extensiones.includes(ext)) {
      setError({ message: `Formato ${ext} no permitido. Acepta: ${config.extensiones.join(', ')}` });
      return;
    }
    if (candidate.size > config.maxBytes) {
      setError({ message: `El archivo pesa ${formatBytes(candidate.size)}; el máximo es ${formatBytes(config.maxBytes)}` });
      return;
    }
    setFile(candidate);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadEvidence(incident.id, { file, descripcion: descripcion.trim(), accionId: accionId ? Number(accionId) : undefined });
      setFile(null);
      setDescripcion('');
      setAccionId('');
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="uploader" onSubmit={submit}>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <label
        className={`dropzone${dragging ? ' dropzone--over' : ''}${file ? ' dropzone--ready' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
      >
        <input ref={inputRef} type="file" className="visually-hidden" accept={config?.extensiones.join(',')} onChange={(e) => pick(e.target.files[0])} />
        {file ? (
          <span><strong>{file.name}</strong> · {formatBytes(file.size)}</span>
        ) : (
          <span><strong>Arrastra un archivo</strong> o haz clic para elegirlo<br />
            <small className="muted">Imágenes, PDF, video, audio o registros (.log, .txt, .csv) · máx. {config ? formatBytes(config.maxBytes) : '…'}</small></span>
        )}
      </label>
      {file && (
        <div className="uploader__fields">
          <input placeholder="Descripción (opcional): qué muestra y de dónde se obtuvo" maxLength={500} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          <select value={accionId} onChange={(e) => setAccionId(e.target.value)} aria-label="Acción relacionada">
            <option value="">Sin acción relacionada</option>
            {incident.acciones.map((a) => <option key={a.id} value={a.id}>{stageLabel(a.etapa)} · {a.descripcion.slice(0, 60)}</option>)}
          </select>
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Subiendo…' : 'Cargar evidencia'}</button>
          <button type="button" className="btn btn--ghost" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }}>Cancelar</button>
        </div>
      )}
    </form>
  );
}
