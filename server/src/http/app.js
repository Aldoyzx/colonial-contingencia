import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, UnauthorizedError } from '../domain/errors.js';
import { describeFlow } from '../domain/flow.js';
import { createAction, updateAction } from '../services/actionService.js';
import {
  advanceIncident,
  createIncident,
  decideIncident,
  getIncidentDetail,
  listIncidents,
} from '../services/incidentService.js';
import { getContingencyPlan } from '../services/planService.js';
import { changeServiceStatus, getDashboard, listServices } from '../services/serviceStatusService.js';
import { getActiveUser, listUsers } from '../services/userService.js';
import {
  advanceSchema,
  createActionSchema,
  createIncidentSchema,
  decisionSchema,
  idParamSchema,
  listIncidentsQuerySchema,
  parse,
  serviceStatusSchema,
  updateActionSchema,
} from './schemas.js';

const CLIENT_DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'client', 'dist');

/**
 * Express 5 propaga a errorHandler los errores de los handlers async; no hace falta try/catch.
 * Identifica al usuario por la cabecera X-User-Id.
 * Prototipo académico: en producción se reemplaza por sesión o JWT firmado.
 */
function authenticate(db) {
  return async (req, _res, next) => {
    const userId = Number.parseInt(req.get('X-User-Id') ?? '', 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedError('Falta la cabecera X-User-Id');
    }
    req.user = await getActiveUser(db, userId);
    next();
  };
}

function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo no es JSON válido' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo excede el tamaño permitido' } });
  }
  if (err?.code === '23505') {
    // Violación de UNIQUE en PostgreSQL (p. ej., una decisión repetida por doble clic).
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'El registro ya existe o fue modificado por otro usuario' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
}

export function createApp(db) {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '20kb' }));

  const api = express.Router();

  api.get('/health', async (_req, res) => {
    await db.one('SELECT 1');
    res.json({ status: 'ok', baseDeDatos: 'ok' });
  });
  api.get('/usuarios', async (_req, res) => res.json(await listUsers(db)));
  api.get('/flujo', (_req, res) => res.json(describeFlow()));
  api.get('/plan', async (_req, res) => res.json(await getContingencyPlan(db)));

  api.use(authenticate(db));

  api.get('/dashboard', async (_req, res) => res.json(await getDashboard(db)));
  api.get('/servicios', async (_req, res) => res.json(await listServices(db)));
  api.patch('/servicios/:id/estado', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await changeServiceStatus(db, id, parse(serviceStatusSchema, req.body), req.user));
  });

  api.get('/incidentes', async (req, res) => {
    res.json(await listIncidents(db, parse(listIncidentsQuerySchema, req.query)));
  });
  api.post('/incidentes', async (req, res) => {
    res.status(201).json(await createIncident(db, parse(createIncidentSchema, req.body), req.user));
  });
  api.get('/incidentes/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await getIncidentDetail(db, id));
  });
  api.post('/incidentes/:id/avanzar', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await advanceIncident(db, id, parse(advanceSchema, req.body), req.user));
  });
  api.post('/incidentes/:id/decisiones', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await decideIncident(db, id, parse(decisionSchema, req.body), req.user));
  });
  api.post('/incidentes/:id/acciones', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.status(201).json(await createAction(db, id, parse(createActionSchema, req.body), req.user));
  });

  api.patch('/acciones/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await updateAction(db, id, parse(updateActionSchema, req.body), req.user));
  });

  api.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } }));

  app.use('/api', api);

  // En modo producción el mismo servidor entrega el frontend compilado.
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('/{*ruta}', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
