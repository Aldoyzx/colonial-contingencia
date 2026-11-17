import { z } from 'zod';
import { ValidationError } from '../domain/errors.js';

const trimmed = (min, max) => z.string().trim().min(min).max(max);
const positiveId = z.coerce.number().int().positive();

export const idParamSchema = z.object({ id: positiveId });

export const createIncidentSchema = z.object({
  titulo: trimmed(5, 120),
  descripcion: trimmed(10, 2000),
  severidad: z.enum(['baja', 'media', 'alta', 'critica']),
  responsableId: positiveId,
  servicioIds: z.array(positiveId).min(1, 'Selecciona al menos un servicio afectado').max(50),
  esSimulacro: z.boolean().optional().default(false),
});

export const listIncidentsQuerySchema = z.object({
  estado: z.enum(['abierto', 'cerrado']).optional(),
});

export const advanceSchema = z.object({
  leccionesAprendidas: z.string().trim().max(4000).optional(),
});

export const decisionSchema = z.object({
  codigo: z.enum(['D1', 'D2', 'D3', 'D4']).optional(),
  respuesta: z.boolean(),
  justificacion: trimmed(5, 1000),
});

export const createActionSchema = z.object({
  descripcion: trimmed(5, 500),
  responsableId: positiveId,
});

export const updateActionSchema = z.object({
  estado: z.enum(['en_progreso', 'completada', 'fallida']),
  resultado: z.string().trim().max(1000).optional(),
});

export const serviceStatusSchema = z.object({
  estado: z.enum(['operativo', 'afectado', 'en_recuperacion']),
  nota: z.string().trim().max(300).optional(),
});

export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      campo: issue.path.join('.') || '(cuerpo)',
      mensaje: issue.message,
    }));
    throw new ValidationError('Datos inválidos', details);
  }
  return result.data;
}
