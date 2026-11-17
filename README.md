# Centro de Contingencia — Colonial Pipeline (2021)

Prototipo funcional para gestionar la respuesta a un ataque de ransomware sobre
infraestructura crítica. Implementa el diagrama de flujo del plan de contingencia como una
máquina de estados: las etapas, las decisiones D1–D4, las rutas alternativas y el
reintento. Incluye un panel de estado de servicios (operativo / afectado / en
recuperación).

## Requisitos

- **Node.js 22 o superior** (`node -v`)
- npm 10 o superior

No hace falta instalar un motor de base de datos: SQLite se guarda en un archivo
(`server/data/contingencia.db`) que se crea solo la primera vez.

## Instalación

```bash
cd server && npm install
cd ../client && npm install
```

## Ejecución

**Modo desarrollo** (dos terminales, con recarga en caliente):

```bash
# Terminal 1 — API en http://localhost:4000
cd server && npm run dev

# Terminal 2 — interfaz en http://localhost:5173 (redirige /api al puerto 4000)
cd client && npm run dev
```

**Modo presentación** (un solo proceso):

```bash
cd client && npm run build
cd ../server && npm start        # abre http://localhost:4000
```

Otros comandos útiles:

```bash
cd server && npm test            # 16 pruebas: los 3 escenarios, reglas de negocio y HTTP
cd server && npm run reset-db    # vuelve la BD a su estado inicial antes de la demo
```

Variables de entorno opcionales: `PORT` (por defecto 4000) y `DB_PATH`.

## Usuarios de prueba

Se eligen en el selector de la barra superior. No hay contraseñas porque es un prototipo
(ver la sección de seguridad).

| Usuario | Rol | Puede |
|---|---|---|
| María Torres | Coordinador de respuesta | Decidir D1–D4, avanzar, cerrar y cambiar cualquier servicio |
| Javier Ríos | Analista TI | Actualizar sus acciones y cambiar servicios TI |
| Lucía Paredes | Operador OT | Actualizar sus acciones y cambiar servicios OT (tramos y SCADA) |
| Andrés Salinas | Asesoría legal | Actualizar sus acciones (evaluación del rescate) |
| Carla Méndez | Comunicaciones | Actualizar sus acciones (ruta alternativa y comunicación pública) |

## Arquitectura

```
client/ (React 19 + Vite 8)            server/ (Node + Express + SQLite)
  Dashboard ── polling 10 s ──┐          http/app.js       rutas, auth, errores
  IncidentDetail              ├─ /api ─► http/schemas.js   validación (zod)
  IncidentForm / List         ┘          services/*        casos de uso (transacciones)
                                         domain/flow.js    máquina de estados del plan
                                         domain/permissions.js
                                         db/schema.sql     modelo de datos
```

- **`domain/flow.js`** es la única fuente de verdad del diagrama. Cada etapa declara su
  tipo (acción o decisión), la acción que se asigna al entrar y su efecto sobre los
  servicios. Cada decisión declara sus ramas Sí/No. El servidor es la autoridad: el
  cliente solo replica etiquetas y transiciones para habilitar o deshabilitar botones, y
  `/api/flujo` expone la definición completa del flujo.
- Cada caso de uso corre dentro de una **transacción SQLite**: una decisión, sus acciones,
  los cambios de estado y el historial se guardan juntos, o no se guarda nada.
- `historial_recuperacion` es la bitácora de auditoría: cada cambio de etapa, decisión,
  acción y estado de servicio queda registrado con su usuario y su fecha.

### Modelo de datos

| Tabla | Propósito |
|---|---|
| `usuarios` | Actores y su rol |
| `servicios` | Activos TI/OT, con su criticidad y estado actual |
| `incidentes` | Incidente, etapa actual del flujo, severidad, intentos de erradicación y lecciones aprendidas |
| `incidente_servicios` | Relación N:M entre incidentes y servicios afectados |
| `acciones` | Tareas de respuesta: etapa, origen (nodo del flujo), responsable y resultado |
| `decisiones` | D1–D4 tomadas, con respuesta, justificación, etapa de origen y de destino |
| `historial_recuperacion` | Auditoría de todos los eventos |

### Reglas de negocio

1. No se puede avanzar ni decidir mientras haya acciones pendientes en la etapa actual.
2. Solo el coordinador toma decisiones; para avanzar hace falta ser el coordinador o el
   responsable del incidente.
3. D1 = Sí detiene preventivamente todos los servicios OT y los vincula al incidente.
4. D3 = Sí se rechaza si alguna acción del intento actual de erradicación falló.
5. D3 = No suma un intento fallido; al tercero, la severidad sube a crítica.
6. Una acción fallida exige explicar el motivo. Las acciones cerradas no se pueden modificar.
7. Un servicio no puede pasar de "afectado" a "operativo" sin pasar antes por "en
   recuperación". Cada rol solo cambia los servicios de su dominio (TI u OT).
8. Para cerrar el incidente se exigen lecciones aprendidas (mínimo 20 caracteres) y que
   no quede ninguna acción abierta.

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/usuarios` | Usuarios activos (sin autenticación) |
| GET | `/api/flujo` | Definición del flujo (etapas y decisiones) |
| GET | `/api/dashboard` | Resumen, servicios por tipo, incidentes abiertos y eventos |
| GET | `/api/servicios` | Lista de servicios |
| PATCH | `/api/servicios/:id/estado` | Cambio manual de estado `{ estado, nota? }` |
| GET | `/api/incidentes?estado=abierto\|cerrado` | Lista de incidentes |
| POST | `/api/incidentes` | Registrar `{ titulo, descripcion, severidad, responsableId, servicioIds[] }` |
| GET | `/api/incidentes/:id` | Detalle con acciones, decisiones, historial y siguiente paso |
| POST | `/api/incidentes/:id/avanzar` | Avanzar en una etapa de acción `{ leccionesAprendidas? }` |
| POST | `/api/incidentes/:id/decisiones` | Decidir `{ respuesta: boolean, justificacion }` |
| POST | `/api/incidentes/:id/acciones` | Acción manual `{ descripcion, responsableId }` |
| PATCH | `/api/acciones/:id` | Actualizar `{ estado, resultado? }` |

Todas las rutas, excepto `usuarios`, `flujo` y `health`, requieren la cabecera
`X-User-Id`. Los errores siguen el formato `{ error: { code, message, details? } }`, con
estos códigos: 400 validación, 401 sin usuario, 403 permiso, 404 no existe y 409 regla
de negocio.

## Seguridad y rendimiento

- **Consultas parametrizadas** en toda la capa SQL, lo que impide la inyección SQL.
- **Validación estricta** con zod: tipos, longitudes y enumeraciones; además, el cuerpo
  está limitado a 20 kB.
- **helmet**: cabeceras de seguridad, CSP y ocultación de `X-Powered-By`.
- Los errores internos no exponen trazas al cliente.
- SQLite en modo WAL, con índices en las claves foráneas más consultadas.
- **Limitación conocida del prototipo:** la identidad viaja en `X-User-Id` sin firma. En
  producción se reemplaza por autenticación real (OIDC/SSO con MFA, que es justamente la
  lección del caso) y por sesiones o JWT firmados.

## Documentación adicional

- `docs/evidencias-pruebas.md`: los tres escenarios paso a paso, para el informe.
- `docs/panel-figma.md`: especificación del panel de servicios para reproducirlo en Figma.
