import { stageLabel } from '../constants.js';

const MAIN_PATH = [
  'deteccion',
  'evaluacion',
  'contencion',
  'erradicacion',
  'recuperacion',
  'servicio_restablecido',
  'cierre',
  'finalizado',
];

/** Las etapas de ruta alternativa se dibujan colgando de su etapa principal. */
const BRANCH_PARENT = {
  analisis_forense: 'erradicacion',
  ruta_alternativa: 'recuperacion',
};

const DECISION_AT = {
  evaluacion: 'D1',
  contencion: 'D2',
  erradicacion: 'D3',
  recuperacion: 'D4',
};

export default function FlowStepper({ etapa, decisiones, intentos }) {
  const anchor = BRANCH_PARENT[etapa] ?? etapa;
  const currentIndex = MAIN_PATH.indexOf(anchor);
  // Con reintentos hay varias D3; Object.fromEntries conserva la última, que es la vigente.
  const decisionByCode = Object.fromEntries(decisiones.map((d) => [d.codigo, d]));

  return (
    <ol className="stepper" aria-label="Progreso del plan de contingencia">
      {MAIN_PATH.map((key, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
        const decision = decisionByCode[DECISION_AT[key]] ?? null;
        const branchHere = Object.entries(BRANCH_PARENT).find(([, parent]) => parent === key)?.[0];

        return (
          <li key={key} className={`stepper__step stepper__step--${state}`}>
            <span className="stepper__dot" aria-hidden="true">{state === 'done' ? '✓' : index + 1}</span>
            <span className="stepper__label">{stageLabel(key)}</span>
            {decision && (
              <span className={`stepper__decision ${decision.respuesta ? 'is-yes' : 'is-no'}`}>
                {decision.codigo}: {decision.respuesta ? 'Sí' : 'No'}
              </span>
            )}
            {branchHere && etapa === branchHere && (
              <span className="stepper__branch">↳ {stageLabel(branchHere)}</span>
            )}
            {key === 'erradicacion' && intentos > 0 && (
              <span className="stepper__retries">{intentos} intento(s) fallido(s)</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
