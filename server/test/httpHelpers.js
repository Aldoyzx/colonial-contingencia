import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/http/app.js';
import { DEMO_PASSWORD } from '../src/db/seedData.js';

export const EMAILS = Object.freeze({
  coordinador: 'mtorres@colonial.local',
  analistaTi: 'jrios@colonial.local',
  operadorOt: 'lparedes@colonial.local',
  legal: 'asalinas@colonial.local',
  comunicaciones: 'cmendez@colonial.local',
});

export function testConfig(overrides = {}) {
  return {
    isProduction: false,
    appSecret: 'secreto-de-pruebas-con-mas-de-32-caracteres',
    sessionHours: 8,
    mfaRequiredRoles: [],
    showDemoAccounts: true,
    storage: 'local',
    uploadsDir: mkdtempSync(join(tmpdir(), 'evidencias-')),
    maxUploadBytes: 1024 * 1024,
    loginRateLimit: 1000,
    ...overrides,
  };
}

/** Levanta la API en un puerto libre y devuelve un cliente que conserva la cookie de sesión. */
export async function startServer(db, config = testConfig()) {
  const server = createApp(db, config).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  function client() {
    let cookie = null;
    const call = async (path, { method = 'GET', body, form, csrf = true, raw = false } = {}) => {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      if (csrf) headers['X-Requested-With'] = 'XMLHttpRequest';
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(`${baseUrl}${path}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? null : setCookie.split(';')[0];
      if (raw) return res;
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = text; }
      return { status: res.status, body: json, headers: res.headers };
    };
    return {
      call,
      login: (email, clave = DEMO_PASSWORD) => call('/auth/login', { method: 'POST', body: { email, clave } }),
      get cookie() { return cookie; },
    };
  }

  return { server, baseUrl, client, close: () => new Promise((resolve) => server.close(resolve)) };
}
