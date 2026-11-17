export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let currentUserId = null;

export function setCurrentUser(userId) {
  currentUserId = userId;
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (currentUserId) headers['X-User-Id'] = String(currentUserId);

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. ¿Está corriendo la API en el puerto 4000?', 0);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(error?.message ?? `Error ${response.status}`, response.status, error?.details);
  }
  return payload;
}

export const api = {
  users: () => request('/usuarios'),
  flow: () => request('/flujo'),
  plan: () => request('/plan'),
  dashboard: () => request('/dashboard'),
  services: () => request('/servicios'),
  changeServiceStatus: (id, data) => request(`/servicios/${id}/estado`, { method: 'PATCH', body: data }),
  incidents: (estado) => request(`/incidentes${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`),
  incident: (id) => request(`/incidentes/${id}`),
  createIncident: (data) => request('/incidentes', { method: 'POST', body: data }),
  advance: (id, data = {}) => request(`/incidentes/${id}/avanzar`, { method: 'POST', body: data }),
  decide: (id, data) => request(`/incidentes/${id}/decisiones`, { method: 'POST', body: data }),
  createAction: (id, data) => request(`/incidentes/${id}/acciones`, { method: 'POST', body: data }),
  updateAction: (id, data) => request(`/acciones/${id}`, { method: 'PATCH', body: data }),
};
