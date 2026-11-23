import { useState } from 'react';
import Ledger from './Ledger.jsx';
import PipelineMap from './PipelineMap.jsx';
import RackMap from './RackMap.jsx';
import Rounds from './Rounds.jsx';

const TABS = [
  { key: 'racks', label: 'Centro de datos' },
  { key: 'oleoducto', label: 'Red del oleoducto' },
  { key: 'rondas', label: 'Rondas de verificación' },
  { key: 'bitacora', label: 'Bitácora' },
];

/**
 * Funciones traídas del proyecto Rack · Operación: mapa de calor por posición, bloqueo
 * de posiciones en rojo (aquí, aislamiento de activos), revisión diaria (rondas) y
 * bitácora encadenada con SHA-256.
 */
export default function HeatMaps({ user, onOpenIncident }) {
  const [tab, setTab] = useState('racks');
  // Desde un activo aislado se puede abrir una ronda ya filtrada.
  const [roundRequest, setRoundRequest] = useState(null);

  const goToRound = (request) => {
    setRoundRequest(request);
    setTab('rondas');
  };

  return (
    <div className="heatmaps">
      <div className="page-head">
        <div>
          <h1>Mapa de calor</h1>
          <p className="muted">Dónde está el riesgo, qué está aislado y qué falta verificar antes de reconectar.</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Vistas del mapa">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              className={tab === t.key ? 'segmented__item segmented__item--active' : 'segmented__item'}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'racks' && <RackMap user={user} onStartRound={goToRound} />}
      {tab === 'oleoducto' && <PipelineMap />}
      {tab === 'rondas' && <Rounds user={user} request={roundRequest} onRequestHandled={() => setRoundRequest(null)} onOpenIncident={onOpenIncident} />}
      {tab === 'bitacora' && <Ledger />}
    </div>
  );
}
