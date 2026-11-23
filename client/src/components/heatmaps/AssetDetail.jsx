import { useState } from 'react';
import { api } from '../../api.js';
import { EVENT_LABELS, HEAT_LABELS, VERIFICATION_LABELS, canOperateAsset, formatDate, formatPercent } from '../../constants.js';
import { useAsync } from '../../useAsync.js';
import { Criticality, ErrorBanner, NoteDialog, ServiceStateBadge } from '../common.jsx';
import { RiskMeter } from './heat.jsx';

export default function AssetDetail({ asset, user, onChanged, onClose, onStartRound }) {
  const history = useAsync(() => api.asset(asset.id), [asset.id, asset.aislado, asset.verificado_en]);
  const [dialog, setDialog] = useState(null); // 'aislar' | 'reconectar' | null
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canOperate = canOperateAsset(user, asset);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDialog(null);
      await onChanged();
      await history.reload();
    } catch (err) {
      setError(err);
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const units = asset.u_alto > 1 ? `U${asset.u_inicio}–${asset.u_inicio + asset.u_alto - 1}` : `U${asset.u_inicio}`;

  return (
    <section className="panel asset-detail" aria-label={`Detalle de ${asset.codigo}`}>
      <header className="asset-detail__head">
        <div>
          <span className="asset-detail__code">{asset.codigo} · {asset.red}</span>
          <h3>{asset.nombre}</h3>
        </div>
        <button type="button" className="alert__close" onClick={onClose} aria-label="Cerrar detalle">×</button>
      </header>

      <dl className="asset-detail__facts">
        <dt>Plataforma</dt><dd>{asset.plataforma}</dd>
        <dt>Función</dt><dd>{asset.funcion}</dd>
        <dt>Ubicación</dt><dd>Rack {asset.rack} · {units} · {asset.ubicacion_nombre} ({asset.ubicacion_ciudad})</dd>
        <dt>Servicio</dt>
        <dd>{asset.servicio_codigo ? <>{asset.servicio_codigo} <ServiceStateBadge estado={asset.servicio_estado} /></> : <span className="muted">Infraestructura base</span>}</dd>
        <dt>Criticidad</dt><dd><Criticality value={asset.criticidad} /></dd>
      </dl>

      <div className="asset-detail__risk">
        <div className="asset-detail__risk-head">
          <strong>Riesgo {formatPercent(asset.riesgo.puntaje)}</strong>
          <span className="muted small">{HEAT_LABELS[asset.riesgo.nivel]}</span>
        </div>
        <RiskMeter riesgo={asset.riesgo} />
        <ul className="risk-factors">
          {asset.riesgo.factores.map((f) => <li key={f.clave}><span>{f.etiqueta}</span><b>+{formatPercent(f.aporte)}</b></li>)}
        </ul>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {asset.aislado ? (
        <div className="isolation isolation--on">
          <strong>⛔ Aislado</strong>
          <p className="small">{asset.aislado_motivo}</p>
          <p className="muted small">{asset.aislado_por_nombre} · {formatDate(asset.aislado_en)}</p>
          {asset.puedeLiberarse ? (
            <p className="small isolation__ok">✓ Verificado OK después del aislamiento: ya se puede reconectar.</p>
          ) : (
            <p className="small">Para reconectarlo, debe pasar una ronda de verificación con resultado OK.</p>
          )}
          <div className="isolation__actions">
            {!asset.puedeLiberarse && (
              <button type="button" className="btn btn--sm" onClick={() => onStartRound({ alcance: 'aislados' })}>Ir a verificar</button>
            )}
            <button type="button" className="btn btn--sm btn--yes" disabled={!canOperate || !asset.puedeLiberarse || busy}
              onClick={() => setDialog('reconectar')}>Reconectar</button>
          </div>
        </div>
      ) : (
        <div className="isolation">
          <p className="small muted">Conectado a la red.</p>
          <button type="button" className="btn btn--sm btn--no" disabled={!canOperate || busy} onClick={() => setDialog('aislar')}>Aislar</button>
        </div>
      )}
      {!canOperate && <p className="hint">Solo el coordinador o el equipo de la red {asset.red} pueden aislar o reconectar este activo.</p>}

      <div className="asset-detail__verify small">
        <b>Última verificación:</b>{' '}
        {asset.verificacion_resultado
          ? <>{VERIFICATION_LABELS[asset.verificacion_resultado]} · {asset.verificado_por_nombre} · {formatDate(asset.verificado_en)}{asset.verificacion_nota ? ` · ${asset.verificacion_nota}` : ''}</>
          : <span className="muted">nunca</span>}
      </div>

      {history.data?.historial?.length > 0 && (
        <ol className="timeline timeline--compact asset-detail__history">
          {history.data.historial.slice(0, 6).map((h) => (
            <li key={h.id}>
              <span className="timeline__title">{EVENT_LABELS[h.evento] ?? h.evento}</span>
              <span className="small">{h.detalle}</span>
              <span className="muted small">{formatDate(h.fecha)} · {h.usuario_nombre}</span>
            </li>
          ))}
        </ol>
      )}

      <NoteDialog
        open={dialog === 'aislar'}
        title={`Aislar ${asset.codigo}`}
        description="El activo se desconecta de la red y no podrá reconectarse sin una verificación OK."
        label="Motivo" required minLength={10} confirmLabel="Aislar"
        onCancel={() => setDialog(null)}
        onConfirm={(motivo) => run(() => api.isolateAsset(asset.id, motivo))}
      />
      <NoteDialog
        open={dialog === 'reconectar'}
        title={`Reconectar ${asset.codigo}`}
        description="Quedará registrado en la bitácora con tu usuario."
        label="Nota" confirmLabel="Reconectar"
        onCancel={() => setDialog(null)}
        onConfirm={(nota) => run(() => api.releaseAsset(asset.id, nota))}
      />
    </section>
  );
}
