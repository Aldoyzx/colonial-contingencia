import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { VERIFICATION_LABELS, canOperateAsset, canStartRound, formatDate } from '../../constants.js';
import { useAsync } from '../../useAsync.js';
import { ErrorBanner, Loading } from '../common.jsx';

const SCOPES = { aislados: 'Activos aislados', rack: 'Un rack', servicio: 'Un servicio' };

function NewRoundForm({ user, preset, onCreated }) {
  const catalog = useAsync(() => Promise.all([api.dataCenterMap(), api.services(), api.incidents('abierto')]), []);
  const [alcance, setAlcance] = useState(preset?.alcance ?? 'aislados');
  const [valor, setValor] = useState(preset?.valor ?? '');
  const [incidenteId, setIncidenteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!canStartRound(user)) return <p className="hint">Solo el coordinador, el analista TI o el operador OT inician rondas.</p>;
  if (!catalog.data) return <Loading />;
  const [map, services, incidents] = catalog.data;
  const options = alcance === 'rack'
    ? map.racks.map((r) => ({ value: r.codigo, label: `${r.codigo} · ${r.nombre}` }))
    : services.map((s) => ({ value: s.codigo, label: `${s.codigo} · ${s.nombre}` }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const round = await api.startRound({
        alcance,
        ...(alcance === 'aislados' ? {} : { valor }),
        ...(incidenteId ? { incidenteId: Number(incidenteId) } : {}),
      });
      onCreated(round.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel round-form" onSubmit={submit}>
      <h3>Nueva ronda</h3>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <label className="field"><span>Qué revisar</span>
        <select value={alcance} onChange={(e) => { setAlcance(e.target.value); setValor(''); }}>
          {Object.entries(SCOPES).map(([k, l]) => <option key={k} value={k}>{l}{k === 'aislados' ? ` (${map.resumen.aislados})` : ''}</option>)}
        </select>
      </label>
      {alcance !== 'aislados' && (
        <label className="field"><span>{alcance === 'rack' ? 'Rack' : 'Servicio'}</span>
          <select value={valor} onChange={(e) => setValor(e.target.value)} required>
            <option value="">Selecciona…</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
      <label className="field"><span>Incidente (opcional)</span>
        <select value={incidenteId} onChange={(e) => setIncidenteId(e.target.value)}>
          <option value="">Ninguno (revisión de rutina)</option>
          {incidents.map((i) => <option key={i.id} value={i.id}>{i.codigo} · {i.titulo}</option>)}
        </select>
      </label>
      <button type="submit" className="btn btn--primary" disabled={busy || (alcance !== 'aislados' && !valor)}>Iniciar ronda</button>
    </form>
  );
}

function CheckRow({ item, round, user, onSaved }) {
  const [resultado, setResultado] = useState(item.resultado ?? '');
  const [nota, setNota] = useState(item.nota ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const editable = !round.cerrada_en && canOperateAsset(user, item);
  const needsNote = resultado && resultado !== 'ok';

  const save = async (value = resultado) => {
    if (!value || (value !== 'ok' && nota.trim().length < 5)) return;
    setBusy(true);
    setError(null);
    try {
      await onSaved(item.activo_id, { resultado: value, ...(value !== 'ok' ? { nota: nota.trim() } : {}) });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const choose = (value) => {
    setResultado(value);
    if (value === 'ok') save('ok');
  };

  return (
    <tr className={item.resultado ? `check check--${item.resultado}` : 'check'}>
      <td><b className="mono">{item.codigo}</b><div className="small muted">{item.nombre}</div></td>
      <td className="small">Rack {item.rack} · U{item.u_inicio}<div className="muted">{item.red}{item.servicio_codigo ? ` · ${item.servicio_codigo}` : ''}{item.aislado ? ' · ⛔ aislado' : ''}</div></td>
      <td>
        <div className="check__buttons" role="group" aria-label={`Resultado de ${item.codigo}`}>
          {Object.entries(VERIFICATION_LABELS).map(([value, label]) => (
            <button key={value} type="button" disabled={!editable || busy} aria-pressed={resultado === value}
              className={`btn btn--sm check__btn check__btn--${value}${resultado === value ? ' is-on' : ''}`}
              onClick={() => choose(value)}>{label}</button>
          ))}
        </div>
        {needsNote && editable && (
          <div className="check__note">
            <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Qué se observó (mín. 5 caracteres)" />
            <button type="button" className="btn btn--sm btn--primary" disabled={busy || nota.trim().length < 5} onClick={() => save()}>Guardar</button>
          </div>
        )}
        {item.nota && (!needsNote || !editable) && <div className="small muted">{item.nota}</div>}
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
      </td>
      <td className="small muted">{item.verificado_por_nombre ? <>{item.verificado_por_nombre}<br />{formatDate(item.verificado_en)}</> : '—'}</td>
    </tr>
  );
}

function RoundDetail({ id, user, onChanged }) {
  const { data: round, error, loading, setData } = useAsync(() => api.round(id), [id]);
  const [actionError, setActionError] = useState(null);

  if (loading && !round) return <Loading />;
  if (!round) return <ErrorBanner error={error} />;

  const pending = round.total - round.verificados;
  const canClose = !round.cerrada_en && (user.rol === 'coordinador' || user.id === round.iniciada_por);
  const reds = [...new Set(round.items.map((i) => i.red))];

  const saveCheck = async (assetId, data) => {
    setData(await api.recordCheck(round.id, assetId, data));
    onChanged();
  };
  const close = async () => {
    setActionError(null);
    try {
      setData(await api.closeRound(round.id));
      onChanged();
    } catch (err) {
      setActionError(err);
    }
  };

  return (
    <section className="panel round-detail">
      <header className="panel__head">
        <div>
          <h3>Ronda #{round.id} · {SCOPES[round.alcance]}{round.alcance_valor ? ` ${round.alcance_valor}` : ''}</h3>
          <p className="muted small">
            Iniciada por {round.iniciada_por_nombre} · {formatDate(round.iniciada_en)}
            {round.incidente_codigo ? ` · ${round.incidente_codigo}` : ''}
            {round.cerrada_en ? ` · cerrada por ${round.cerrada_por_nombre} el ${formatDate(round.cerrada_en)}` : ''}
          </p>
        </div>
        <span className={`badge ${round.cerrada_en ? 'badge--operativo' : 'badge--en_recuperacion'}`}>{round.cerrada_en ? 'Cerrada' : `${pending} pendiente(s)`}</span>
      </header>

      <div className="checklist-guide">
        {reds.map((red) => (
          <div key={red}>
            <b>Qué revisar en {red}</b>
            <ul>{round.checklist[red].map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table round-table">
          <thead><tr><th>Activo</th><th>Ubicación</th><th>Resultado</th><th>Verificó</th></tr></thead>
          <tbody>
            {round.items.map((item) => (
              <CheckRow key={`${item.activo_id}-${item.verificado_en ?? ''}`} item={item} round={round} user={user} onSaved={saveCheck} />
            ))}
          </tbody>
        </table>
      </div>

      <ErrorBanner error={actionError} onDismiss={() => setActionError(null)} />
      {!round.cerrada_en && (
        <div className="form__actions">
          {pending > 0 && <span className="hint">Verifica todos los activos para cerrar la ronda.</span>}
          <button type="button" className="btn btn--primary" disabled={!canClose || pending > 0} onClick={close}>Cerrar ronda</button>
        </div>
      )}
    </section>
  );
}

export default function Rounds({ user, request, onRequestHandled }) {
  const { data: rounds, error, loading, reload } = useAsync(() => api.rounds(), []);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(Boolean(request));
  const [preset, setPreset] = useState(request);

  useEffect(() => {
    if (!request) return;
    setPreset(request);
    setCreating(true);
    setSelectedId(null);
    onRequestHandled();
  }, [request, onRequestHandled]);

  if (loading && !rounds) return <Loading />;
  if (!rounds) return <ErrorBanner error={error} />;

  return (
    <div className="rounds">
      <aside className="rounds__list">
        {canStartRound(user) && (
          <button type="button" className="btn btn--primary btn--block" onClick={() => { setPreset(null); setCreating(true); setSelectedId(null); }}>+ Nueva ronda</button>
        )}
        {rounds.length === 0 && <p className="muted">Aún no hay rondas.</p>}
        <ul>
          {rounds.map((r) => (
            <li key={r.id}>
              <button type="button" className={`round-card${selectedId === r.id ? ' is-selected' : ''}`} onClick={() => { setSelectedId(r.id); setCreating(false); }}>
                <span className="round-card__head"><b>#{r.id} · {SCOPES[r.alcance]}{r.alcance_valor ? ` ${r.alcance_valor}` : ''}</b>
                  <span className={`badge ${r.cerrada_en ? 'badge--operativo' : 'badge--en_recuperacion'}`}>{r.cerrada_en ? 'Cerrada' : 'Abierta'}</span></span>
                <span className="round-card__bar"><i style={{ width: `${r.total ? (r.verificados / r.total) * 100 : 0}%` }} /></span>
                <span className="small muted">{r.verificados}/{r.total} verificados · {r.ok} OK · {r.observados} obs. · {r.fallas} fallas</span>
                <span className="small muted">{r.iniciada_por_nombre} · {formatDate(r.iniciada_en)}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="rounds__main">
        {creating && <NewRoundForm key={JSON.stringify(preset)} user={user} preset={preset} onCreated={(id) => { setCreating(false); setSelectedId(id); reload(); }} />}
        {!creating && selectedId && <RoundDetail id={selectedId} user={user} onChanged={reload} />}
        {!creating && !selectedId && (
          <div className="panel">
            <h3>¿Para qué sirven las rondas?</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              Como la revisión diaria de ubicaciones del rack: antes de reconectar un activo aislado, alguien de su red
              lo revisa con una lista fija y deja el resultado firmado en la bitácora. Sin un OK posterior al aislamiento,
              el sistema no permite reconectarlo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

