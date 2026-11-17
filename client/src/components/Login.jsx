import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ROLE_LABELS } from '../constants.js';
import { ErrorBanner } from './common.jsx';

/** Inicio de sesión en dos pasos: contraseña y, si la cuenta tiene MFA, código de 6 dígitos. */
export default function Login({ onLoggedIn }) {
  const [config, setConfig] = useState(null);
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [codigo, setCodigo] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.authConfig().then(setConfig).catch(() => setConfig({}));
  }, []);

  const submitPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.login({ email: email.trim(), clave });
      if (result.mfaRequerido) {
        setChallenge(result.desafio);
        setCodigo('');
      } else {
        onLoggedIn(result);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLoggedIn(await api.loginMfa({ desafio: challenge, codigo }));
    } catch (err) {
      setError(err);
      if (err.status === 401 && /venció/.test(err.message)) setChallenge(null);
    } finally {
      setBusy(false);
    }
  };

  const demo = config?.cuentasDemo;

  return (
    <div className="login">
      <section className="login__hero" aria-hidden="true">
        <span className="brand__mark brand__mark--lg" />
        <h1>Centro de Contingencia</h1>
        <p>Respuesta a ransomware sobre infraestructura crítica · caso Colonial Pipeline (2021)</p>
        <ul className="login__facts">
          <li><strong>MFA</strong> con app autenticadora</li>
          <li><strong>Bitácora</strong> de auditoría inmutable</li>
          <li><strong>Evidencias</strong> con huella SHA-256</li>
        </ul>
      </section>

      <section className="login__panel">
        {!challenge ? (
          <form className="login__form" onSubmit={submitPassword} noValidate>
            <h2>Iniciar sesión</h2>
            <ErrorBanner error={error} />
            <label className="field">
              <span>Correo corporativo</span>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
            </label>
            <button type="submit" className="btn btn--primary btn--block" disabled={busy || !email || !clave}>
              {busy ? 'Verificando…' : 'Entrar'}
            </button>
            <p className="hint">Tras 5 intentos fallidos la cuenta se bloquea 15 minutos.</p>

            {demo && (
              <div className="demo-accounts">
                <p className="small muted">Cuentas de demostración · contraseña <code>{demo.clave}</code></p>
                <div className="demo-accounts__list">
                  {demo.cuentas.map((c) => (
                    <button key={c.email} type="button" className="chip-button" onClick={() => { setEmail(c.email); setClave(demo.clave); }}>
                      <strong>{c.nombre}</strong>
                      <span>{ROLE_LABELS[c.rol]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        ) : (
          <form className="login__form" onSubmit={submitCode} noValidate>
            <h2>Verificación en dos pasos</h2>
            <p className="muted">Abre tu app autenticadora (Google o Microsoft Authenticator) y escribe el código de 6 dígitos.</p>
            <ErrorBanner error={error} />
            <label className="field">
              <span>Código</span>
              <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} autoFocus />
            </label>
            <button type="submit" className="btn btn--primary btn--block" disabled={busy || codigo.length !== 6}>
              {busy ? 'Verificando…' : 'Verificar'}
            </button>
            <button type="button" className="btn btn--ghost btn--block" onClick={() => { setChallenge(null); setError(null); }}>Volver</button>
          </form>
        )}
      </section>
    </div>
  );
}
