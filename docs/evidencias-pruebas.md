# Evidencias de pruebas

Los tres escenarios que exige la actividad están automatizados en
`server/test/scenarios.test.js` y también se pueden reproducir a mano en la interfaz. Para
el informe, ejecuta `npm test` dentro de `server/` y adjunta una captura de la salida.

Resultado esperado: `# tests 16 · # pass 16 · # fail 0`.

## Escenario 1: incidente inicial

| Paso | Acción en la UI (usuario: María Torres, coordinadora) | Resultado esperado |
|---|---|---|
| 1 | Registrar incidente con TI-FACT, TI-VPN y TI-AD | Código `INC-AAAA-0001` en etapa Detección; los 3 servicios pasan a **Afectado** en el panel |
| 2 | Intentar avanzar sin cerrar la acción de detección | Bloqueado con el aviso "Completa o marca como fallidas…" |
| 3 | Completar la acción y avanzar | Etapa Evaluación; aparece la decisión **D1** |
| 4 | Completar la acción de evaluación y responder D1 = **Sí** | Los 4 servicios OT pasan a **Afectado** con la nota "Detenido preventivamente"; disponibilidad del 30 % |

## Escenario 2: recuperación exitosa

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | D2 = No (respaldos comprometidos, como en el caso real) | Se asigna la acción legal del pago del rescate y el descifrado |
| 2 | Completar las acciones de erradicación y responder D3 = **Sí** | Etapa Recuperación; los servicios pasan a **En recuperación** (ámbar) |
| 3 | D4 = **Sí** (riesgo de desabastecimiento) | Ruta alternativa: acción de transporte por camiones asignada a Comunicaciones |
| 4 | Avanzar | Servicio restablecido: **todos los servicios en Operativo**, disponibilidad del 100 % |
| 5 | Avanzar e intentar cerrar sin lecciones aprendidas | Error de validación |
| 6 | Cerrar con lecciones aprendidas | Incidente **Cerrado**, con 4 decisiones registradas en el historial |

## Escenario 3: recuperación fallida

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | En Erradicación, marcar la acción como **Falló** ("Persistencia en el controlador de dominio") | Se exige escribir el motivo |
| 2 | Responder D3 = Sí | **Rechazado**: no se puede validar con una erradicación fallida |
| 3 | Responder D3 = **No** | Etapa Análisis forense; contador de intentos fallidos = 1; los servicios siguen afectados |
| 4 | Completar el análisis y pulsar "Reintentar erradicación" | Vuelve a Erradicación con una **nueva** acción de erradicación (ruta *Reintentar* del diagrama) |
| 5 | Repetir la falla tres veces | La severidad se escala automáticamente a **Crítica** y se registra en el historial |
| 6 | En Recuperación, el operador OT cambia `OT-T3` a Afectado ("Fuga de presión al reiniciar") | Se permite; en cambio, el paso directo de Afectado a Operativo se rechaza |

## Pruebas de reglas y seguridad (HTTP)

- Sin cabecera de usuario, o con un usuario inexistente, la API responde **401**.
- Cuerpo inválido: **400**, con el detalle de cada campo.
- JSON mal formado: **400**.
- Un rol sin permiso que intenta decidir recibe **403**; una decisión fuera de etapa, **409**.
- Un id no numérico devuelve **400** y un recurso inexistente, **404**.
