# Centro de Contingencia — Colonial Pipeline (2021)

Sistema web para gestionar la respuesta a un ataque de ransomware sobre infraestructura
crítica. Implementa el diagrama de flujo del plan de contingencia como una máquina de
estados (etapas, decisiones D1–D4, ruta alternativa y reintento) e incluye el panel de
estado de servicios diseñado en Figma (operativo / afectado / en recuperación).

| Capa | Tecnología |
|---|---|
| Diseño | Figma (4 pantallas: normal, crisis, recuperación y móvil) |
| Frontend | React 19 + Vite 8, CSS con los tokens de Figma |
| Backend | Node.js 22 + Express 5, validación con zod, cabeceras con helmet |
| Base de datos | **PostgreSQL 16** (driver `pg`) |
| Control de versiones | Git + GitHub |

## Requisitos

- **Node.js 22 o superior** y npm 10
- **PostgreSQL 16**, con una de estas dos opciones:
  - Docker Desktop: `docker compose up -d` (recomendado; crea todo solo)
  - PostgreSQL instalado (pgAdmin en Windows): ejecutar `database/00_crear_base_de_datos.sql`

## Puesta en marcha

```bash
# 1. Base de datos
docker compose up -d
#    o, con PostgreSQL instalado:
#    psql -U postgres -f database/00_crear_base_de_datos.sql

# 2. Dependencias
cd server && npm install
cd ../client && npm install

# 3. Ejecutar (modo presentación: un solo proceso en http://localhost:4000)
cd ../client && npm run build
cd ../server && npm run db:demo     # esquema + datos iniciales + incidente de prueba de 2021
npm start
```

Al arrancar, el servidor crea el esquema si la base está vacía. Para desarrollo con recarga
en caliente usa dos terminales: `cd server && npm run dev` y `cd client && npm run dev`
(abre http://localhost:5173).

Variables de entorno (copiar `server/.env.example` como `server/.env`): `PORT` y
`DATABASE_URL` (por defecto `postgres://contingencia:contingencia@localhost:5432/contingencia`).

| Comando (en `server/`) | Qué hace |
|---|---|
| `npm test` | Pruebas automatizadas contra la base `contingencia_test` |
| `npm run db:reset` | Recrea el esquema con los datos iniciales |
| `npm run db:demo` | Igual que `db:reset` y además carga el incidente real de mayo de 2021 |
| `npm run db:generate-seed` | Regenera `database/02_datos_iniciales.sql` desde el código |

## Base de datos

Los scripts entregables están en `database/` y son la única fuente del esquema: el
servidor ejecuta esos mismos archivos.

| Script | Contenido |
|---|---|
| `00_crear_base_de_datos.sql` | Rol `contingencia` y bases `contingencia` / `contingencia_test` |
| `01_esquema.sql` | 8 tipos ENUM, 11 tablas, PK, FK, UNIQUE, CHECK, índices y 3 vistas |
| `02_datos_iniciales.sql` | Catálogo del plan (10 etapas, D1–D4, 15 recursos), 5 usuarios y 10 servicios |
| `03_verificacion.sql` | Consultas que listan tablas, restricciones, relaciones y vistas |
| `04_datos_prueba.sql` | Incidente INC-2021-0001 completo (acciones, decisiones e historial) |

Diagrama entidad-relación: `docs/der/DER.png` (fuente Mermaid en `DER.mmd`).

| Tabla | Propósito |
|---|---|
| `etapas` | Nodos del plan: orden, tipo, procedimiento, rol responsable y etapa siguiente |
| `decisiones_plan` | Rombos D1–D4 con su pregunta y destinos Sí / No |
| `recursos_tecnologicos` / `etapa_recursos` | Recursos que necesita cada etapa (N:M) |
| `usuarios` | Actores del plan y su rol |
| `servicios` | Activos TI/OT, criticidad y estado actual |
| `incidentes` | Incidente, etapa actual (FK a `etapas`), severidad, intentos y lecciones |
| `incidente_servicios` | Servicios afectados por incidente (N:M) |
| `acciones` | Tareas de respuesta, responsable, resultado y nodo de origen |
| `decisiones` | D1–D4 tomadas, con justificación, etapa origen y destino |
| `historial_recuperacion` | Bitácora de auditoría |

Restricciones destacadas: el prefijo del código de servicio debe coincidir con su tipo;
un incidente cerrado exige etapa final, fecha y lecciones (mínimo 20 caracteres); una
acción fallida exige resultado; D1, D2 y D4 se toman una sola vez por incidente (índice
único parcial); los servicios vinculados a incidentes no se pueden borrar.

## Arquitectura

```
client/ (React + Vite)                 server/ (Node + Express 5)              PostgreSQL 16
  Dashboard ── polling 10 s ──┐          http/app.js      rutas y errores
  IncidentDetail              ├─ /api ─► http/schemas.js  validación (zod)
  IncidentForm / List         ┘          services/*       casos de uso ──── transacción ──► tablas
                                         domain/flow.js   máquina de estados del plan      vistas
```

- `domain/flow.js` es la fuente de verdad del diagrama; `02_datos_iniciales.sql` se genera
  a partir de él y una prueba comprueba que la base y el código coinciden.
- Cada caso de uso corre en **una transacción** con `SELECT … FOR UPDATE` sobre el
  incidente: dos usuarios no pueden decidir a la vez sobre el mismo incidente.

## Usuarios de prueba

| Usuario | Rol | Puede |
|---|---|---|
| María Torres | Coordinador de respuesta | Decidir D1–D4, avanzar, cerrar y cambiar cualquier servicio |
| Javier Ríos | Analista TI | Actualizar sus acciones y cambiar servicios TI |
| Lucía Paredes | Operador OT | Actualizar sus acciones y cambiar servicios OT |
| Andrés Salinas | Asesoría legal | Actualizar sus acciones (evaluación del rescate) |
| Carla Méndez | Comunicaciones | Actualizar sus acciones (ruta alternativa) |

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado de la API y de la conexión a PostgreSQL |
| GET | `/api/usuarios` | Usuarios activos |
| GET | `/api/flujo` | Definición del flujo |
| GET | `/api/dashboard` | Resumen, servicios, incidentes abiertos y eventos |
| PATCH | `/api/servicios/:id/estado` | Cambio manual de estado `{ estado, nota? }` |
| GET/POST | `/api/incidentes` | Listar (`?estado=`) o registrar incidentes |
| GET | `/api/incidentes/:id` | Detalle con acciones, decisiones, historial y siguiente paso |
| POST | `/api/incidentes/:id/avanzar` | Avanzar en una etapa de acción |
| POST | `/api/incidentes/:id/decisiones` | Decidir `{ respuesta, justificacion }` |
| POST | `/api/incidentes/:id/acciones` | Acción manual |
| PATCH | `/api/acciones/:id` | Actualizar estado y resultado |

Las rutas protegidas exigen la cabecera `X-User-Id`. Errores: `{ error: { code, message, details? } }`
con 400 validación, 401 sin usuario, 403 permiso, 404 no existe y 409 regla de negocio.

## Seguridad

- Consultas parametrizadas (`$1, $2…`) en toda la capa SQL.
- Validación con zod en la API y restricciones CHECK / FK en la base (doble barrera).
- helmet, límite de 20 kB por petición y errores internos sin trazas.
- Rol de base de datos propio, sin privilegios de superusuario.
- **Limitación conocida:** la identidad viaja en `X-User-Id` sin firma. En producción se
  reemplaza por OIDC/SSO con MFA (la lección del caso).
