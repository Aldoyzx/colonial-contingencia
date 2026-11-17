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
 * Identifica al usuario por la cabecera X-User-Id.
 * Prototipo académico: en producción se reemplaza por sesión o JWT firmado.
 */
function authenticate(db) {
  return (req, _res, next) => {
    const raw = req.get('X-User-Id');
    const userId = Number.parseInt(raw ?? '', 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return next(new UnauthorizedError('Falta la cabecera X-User-Id'));
    }
    try {
      req.user = getActiveUser(db, userId);
      next();
    } catch (error) {
      next(error);
    }
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
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
}

export function createApp(db) {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '20kb' }));

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ status: 'ok' }));
  api.get('/usuarios', (_req, res) => res.json(listUsers(db)));
  api.get('/flujo', (_req, res) => res.json(describeFlow()));

  api.use(authenticate(db));

  api.get('/dashboard', (_req, res) => res.json(getDashboard(db)));
  api.get('/servicios', (_req, res) => res.json(listServices(db)));
  api.patch('/servicios/:id/estado', (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(changeServiceStatus(db, id, parse(serviceStatusSchema, req.body), req.user));
  });

  api.get('/incidentes', (req, res) => {
    res.json(listIncidents(db, parse(listIncidentsQuerySchema, req.query)));
  });
  api.post('/incidentes', (req, res) => {
    res.status(201).json(createIncident(db, parse(createIncidentSchema, req.body), req.user));
  });
  api.get('/incidentes/:id', (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(getIncidentDetail(db, id));
  });
  api.post('/incidentes/:id/avanzar', (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(advanceIncident(db, id, parse(advanceSchema, req.body), req.user));
  });
  api.post('/incidentes/:id/decisiones', (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(decideIncident(db, id, parse(decisionSchema, req.body), req.user));
  });
  api.post('/incidentes/:id/acciones', (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.status(201).json(createAction(db, id, parse(createActionSchema, req.body), req.user));
  });

  api.patch('/acciones/:id', (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(updateAction(db, id, parse(updateActionSchema, req.body), req.user));
  });

  api.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } }));

  app.use('/api', api);

  // En modo producción el mismo servidor entrega el frontend compilado.
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
