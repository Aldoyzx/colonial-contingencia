import { useState } from 'react';
import { api } from '../api.js';
import { ROLE_LABELS, SECURITY_EVENT_LABELS, formatDate } from '../constants.js';
import { useAsync } from '../useAsync.js';
import { ErrorBanner, Loading } from './common.jsx';

function MfaSection({ session, onSessionChange }) {
  const { usuario, mfaPendiente } = session;
  const [enrollment, setEnrollment] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (usuario.mfa_activo) {
    return (
      <section className="panel account-card">
        <header className="panel__head"><h3>Verificación en dos pasos (MFA)</h3><span className="badge badge--operativo">Activa</span></header>
        <p className="muted">Cada inicio de sesión pide un código de tu app autenticadora además de la contraseña.</p>
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        <form className="form__row" onSubmit={(e) => { e.preventDefault(); run(async () => onSessionChange(await api.disableMfa({ clave, codigo }))); }}>
          <label className="field"><span>Contraseña</span><input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" /></label>
          <label className="field"><span>Código actual</span><input className="code-input" inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} /></label>
          <div className="form__actions"><button type="submit" className="btn btn--ghost" disabled={busy || !clave || codigo.length !== 6}>Desactivar MFA</button></div>
        </form>
      </section>
    );
  }

  return (
    <section className={`panel account-card${mfaPendiente ? ' account-card--required' : ''}`}>
      <header className="panel__head"><h3>Verificación en dos pasos (MFA)</h3><span className="badge badge--afectado">Inactiva</span></header>
      {mfaPendiente && (
        <div className="alert alert--warning" role="alert">
          <strong>Tu rol exige MFA.</strong>&nbsp;Actívala para usar el sistema: el ataque a Colonial entró por una VPN sin segundo factor.
        </div>
      )}
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {!enrollment ? (
        <>
          <p className="muted">Protege tu cuenta aunque alguien obtenga tu contraseña. Necesitas Google Authenticator, Microsoft Authenticator o Authy en tu teléfono.</p>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => run(async () => setEnrollment(await api.startMfa()))}>Activar MFA</button>
        </>
      ) : (
        <div className="mfa-enroll">
          <img src={enrollment.qr} alt="Código QR para la app autenticadora" width="200" height="200" />
          <div className="mfa-enroll__steps">
            <ol>
              <li>Abre la app autenticadora y elige <strong>agregar cuenta → escanear código QR</strong>.</li>
              <li>Si no puedes escanear, escribe esta clave: <code className="secret">{enrollment.secreto.match(/.{1,4}/g).join(' ')}</code></li>
              <li>Escribe el código de 6 dígitos que muestra la app.</li>
            </ol>
            <form className="mfa-enroll__confirm" onSubmit={(e) => { e.preventDefault(); run(async () => { onSessionChange(await api.confirmMfa(codigo)); setEnrollment(null); }); }}>
              <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} aria-label="Código de verificación" autoFocus />
              <button type="submit" className="btn btn--primary" disabled={busy || codigo.length !== 6}>Confirmar</button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function PasswordSection() {
  const [form, setForm] = useState({ actual: '', nueva: '', repetir: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const mismatch = form.repetir && form.nueva !== form.repetir;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api.changePassword({ actual: form.actual, nueva: form.nueva });
      setForm({ actual: '', nueva: '', repetir: '' });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, autoComplete) => (
    <label className="field"><span>{label}</span>
      <input type="password" autoComplete={autoComplete} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </label>
  );

  return (
    <section className="panel account-card">
      <header className="panel__head"><h3>Contraseña</h3></header>
      <p className="muted small">Mínimo 12 caracteres; una frase larga es más segura que una palabra con símbolos (NIST SP 800-63B-4). Se rechazan palabras previsibles como el nombre de la empresa. Se guarda con scrypt: nadie puede leerla, ni siquiera en la base de datos.</p>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {done && <div className="alert alert--success" role="status">Contraseña actualizada.</div>}
      <form className="account-form" onSubmit={submit}>
        {field('actual', 'Contraseña actual', 'current-password')}
        {field('nueva', 'Nueva contraseña', 'new-password')}
        {field('repetir', 'Repite la nueva', 'new-password')}
        {mismatch && <small className="field__error">Las contraseñas no coinciden</small>}
        <div className="form__actions"><button type="submit" className="btn btn--primary" disabled={busy || !form.actual || !form.nueva || mismatch}>Cambiar contraseña</button></div>
      </form>
    </section>
  );
}

function SecurityLog() {
  const { data, error, loading } = useAsync(() => api.securityEvents(), []);
  if (loading && !data) return <Loading />;
  return (
    <section className="panel table-wrap">
      <header className="panel__head"><h3>Bitácora de seguridad</h3><span className="muted small">Últimos 50 eventos · solo coordinador</span></header>
      <ErrorBanner error={error} />
      {data && (
        <table className="table">
          <thead><tr><th>Fecha</th><th>Evento</th><th>Usuario</th><th>IP</th><th>Detalle</th></tr></thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id}>
                <td className="small">{formatDate(e.fecha)}</td>
                <td><span className={`badge badge--sec-${e.evento}`}>{SECURITY_EVENT_LABELS[e.evento] ?? e.evento}</span></td>
                <td>{e.usuario_nombre ?? e.email_intentado ?? '—'}</td>
                <td className="small muted">{e.ip ?? '—'}</td>
                <td className="small">{e.detalle ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function Account({ session, onSessionChange }) {
  const { usuario } = session;
  return (
    <div className="account">
      <div className="page-head">
        <div>
          <h1>Mi cuenta</h1>
          <p className="muted">{usuario.nombre} · {ROLE_LABELS[usuario.rol]} · {usuario.email}</p>
        </div>
        {usuario.ultimo_acceso && <span className="muted small">Último acceso: {formatDate(usuario.ultimo_acceso)}</span>}
      </div>
      <div className="account__grid">
        <MfaSection session={session} onSessionChange={onSessionChange} />
        <PasswordSection />
      </div>
      {usuario.rol === 'coordinador' && !session.mfaPendiente && <SecurityLog />}
    </div>
  );
}
