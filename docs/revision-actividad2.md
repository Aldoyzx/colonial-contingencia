# Revisión del sistema y del plan de contingencia (Actividad 2)

Revisión hecha sobre la versión de la Actividad 1 (commit `ce09508`). Cada hallazgo tiene
una corrección en el commit de la Actividad 2 y, cuando aplica, una prueba de regresión en
`server/test/revision.test.js` que falla con la versión anterior.

## Hallazgos y correcciones

| # | Área | Hallazgo | Corrección | Evidencia |
|---|---|---|---|---|
| H1 | Base de datos | La bitácora se ordenaba por `id`: un evento cargado tarde aparecía fuera de orden | `ORDER BY fecha DESC, id DESC` e índice `(incidente_id, fecha DESC)` | Prueba H1 |
| H2 | Seguridad / auditoría | `historial_recuperacion` se podía modificar o borrar con acceso directo a la base | Trigger `trg_historial_inmutable` (solo inserción) | Prueba H2 |
| H3 | Concurrencia | El código `INC-AAAA-NNNN` salía de `MAX(id)+1`: dos altas simultáneas obtenían el mismo código | Secuencia `incidente_numero_seq` | Prueba H3 (5 altas en paralelo) |
| H4 | Diseño (Figma) | Los puntos de "Últimos eventos" del panel no usaban el color por tipo de evento | Clases por evento, igual que en el detalle | Captura 04 |
| H5 | Usabilidad | La nota del cambio de estado usaba `window.prompt`: sin validación, sin estilo y sin forma de exigir el motivo de una falla | Diálogo modal accesible (`<dialog>`), contador de 300 caracteres y nota obligatoria para "afectado" | Captura 05 |
| H6 | Plan de contingencia | Procedimiento, responsables y recursos solo estaban en el documento, no en el sistema | Módulo **Plan de contingencia** (`GET /api/plan`) leído de `etapas`, `decisiones_plan` y `recursos_tecnologicos` | Prueba H6 y capturas 01–02 |
| H7 | Simulación | No había forma de ensayar el plan sin confundir el ejercicio con un incidente real | Campo `es_simulacro`, distintivo en todo el sistema, aviso en el panel y `npm run simulacro` | Prueba H7 e informe en `docs/evidencias/` |
| H8 | Calidad | Las pruebas solo se ejecutaban a mano | Integración continua en GitHub Actions con PostgreSQL 16 | `.github/workflows/ci.yml` |
| H9 | Presentación de datos | Las fechas usaban formato regional `es-PE` y una conversión heredada de SQLite | Formato `es-CO` sobre TIMESTAMPTZ | Capturas |

Las bases creadas con la versión anterior se actualizan con
`database/05_migracion_actividad2.sql`, que el servidor aplica solo al arrancar.

## Pendientes para la revisión final

| # | Pendiente | Motivo | Propuesta |
|---|---|---|---|
| P1 | La identidad viaja en la cabecera `X-User-Id` sin firma | Fuera del alcance del prototipo | Inicio de sesión con OIDC/SSO y MFA, y tokens firmados |
| P2 | No hay notificaciones automáticas a los responsables | Requiere un proveedor de correo o SMS | Avisar por correo cuando se asigna una acción |
| P3 | Los respaldos de la base son manuales (`pg_dump`) | Depende de la infraestructura | Tarea programada con `pg_dump` y copia fuera de línea |

## Simulación

`cd server && npm run simulacro` ejecuta el escenario "ransomware por VPN sin MFA con
erradicación fallida" sobre la base configurada, completa cada acción con su responsable
real y escribe el informe en `docs/evidencias/simulacro-*.md` (17 verificaciones).
