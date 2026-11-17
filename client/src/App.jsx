import { useEffect, useMemo, useState } from 'react';
import { api, setCurrentUser } from './api.js';
import { ROLE_LABELS } from './constants.js';
import { ErrorBanner, Loading } from './components/common.jsx';
import Dashboard from './components/Dashboard.jsx';
import IncidentList from './components/IncidentList.jsx';
import IncidentForm from './components/IncidentForm.jsx';
import IncidentDetail from './components/IncidentDetail.jsx';

const USER_STORAGE_KEY = 'contingencia.userId';

function readStoredUserId() {
  try {
    return Number.parseInt(localStorage.getItem(USER_STORAGE_KEY) ?? '', 10) || null;
  } catch {
    return null;
  }
}

function storeUserId(id) {
  try {
    localStorage.setItem(USER_STORAGE_KEY, String(id));
  } catch {
    // Almacenamiento no disponible (modo privado): la sesión sigue en memoria.
  }
}

const NAV = [
  { key: 'panel', label: 'Panel de servicios' },
  { key: 'incidentes', label: 'Incidentes' },
  { key: 'nuevo', label: 'Registrar incidente' },
];

/** Enrutado por hash: permite enlaces directos (#/incidentes/3) sin dependencias extra. */
function parseHash(hash) {
  const [, section, id] = hash.replace(/^#/, '').split('/');
  const numericId = Number.parseInt(id ?? '', 10);
  if (section === 'incidentes' && numericId > 0) return { name: 'detalle', id: numericId };
  if (section === 'incidentes') return { name: 'incidentes' };
  if (section === 'nuevo') return { name: 'nuevo' };
  return { name: 'panel' };
}

function viewToHash(view) {
  if (view.name === 'detalle') return `#/incidentes/${view.id}`;
  return view.name === 'panel' ? '#/' : `#/${view.name}`;
}

function useHashView() {
  const [view, setViewState] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setViewState(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const setView = (next) => {
    window.location.hash = viewToHash(next);
  };
  return [view, setView];
}

export default function App() {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState(null);
  const [view, setView] = useHashView();
  const [error, setError] = useState(null);

  useEffect(() => {
    api.users()
      .then((list) => {
        setUsers(list);
        const stored = readStoredUserId();
        const initial = list.some((u) => u.id === stored) ? stored : list[0]?.id;
        setCurrentUser(initial);
        setUserId(initial);
      })
      .catch(setError);
  }, []);

  const currentUser = useMemo(() => users.find((u) => u.id === userId) ?? null, [users, userId]);

  const changeUser = (id) => {
    setCurrentUser(id);
    storeUserId(id);
    setUserId(id);
  };

  const openIncident = (id) => setView({ name: 'detalle', id });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <div>
            <strong>Centro de Contingencia</strong>
            <small>Colonial Pipeline · Respuesta a ransomware</small>
          </div>
        </div>

        <nav className="nav" aria-label="Secciones">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              className={view.name === item.key ? 'nav__item nav__item--active' : 'nav__item'}
              onClick={() => setView({ name: item.key })}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <label className="user-picker">
          <span>Usuario</span>
          <select value={userId ?? ''} onChange={(e) => changeUser(Number(e.target.value))} disabled={!users.length}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre} — {ROLE_LABELS[u.rol]}</option>
            ))}
          </select>
        </label>
      </header>

      <main className="content">
        <ErrorBanner error={error} />
        {!currentUser ? (
          !error && <Loading label="Conectando…" />
        ) : (
          <>
            {view.name === 'panel' && <Dashboard user={currentUser} onOpenIncident={openIncident} />}
            {view.name === 'incidentes' && <IncidentList key={userId} onOpen={openIncident} />}
            {view.name === 'nuevo' && <IncidentForm users={users} currentUser={currentUser} onCreated={openIncident} />}
            {view.name === 'detalle' && (
              <IncidentDetail
                id={view.id}
                users={users}
                user={currentUser}
                onBack={() => setView({ name: 'incidentes' })}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
