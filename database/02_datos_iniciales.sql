-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  02 · Datos iniciales: catálogo del plan, recursos, usuarios y servicios
--  Gestor: PostgreSQL 16 · ARCHIVO GENERADO por server/scripts/generate-seed-sql.js
--
--  Es idempotente: puede ejecutarse varias veces sin duplicar registros.
--  psql -U contingencia -d contingencia -f database/02_datos_iniciales.sql
-- =============================================================================

BEGIN;

-- Etapas del plan (nodos del diagrama de flujo)
INSERT INTO etapas (clave, nombre, orden, tipo, procedimiento, rol_responsable, siguiente, es_reintento) VALUES
  ('deteccion', 'Detección', 1, 'accion', 'Confirmar la nota de rescate, revisar las alertas del EDR y del SIEM y registrar el incidente con los servicios afectados.', 'analista_ti', 'evaluacion', FALSE),
  ('evaluacion', 'Evaluación', 2, 'decision', 'Activar el comité de crisis, medir el alcance (equipos cifrados, cuentas comprometidas) y estimar el riesgo de propagación a la red OT. Resolver D1.', 'coordinador', NULL, FALSE),
  ('contencion', 'Contención', 3, 'decision', 'Desconectar los equipos comprometidos, bloquear accesos (VPN y cuentas), preservar evidencia y notificar a FBI, CISA y Dpto. de Energía. Resolver D2.', 'analista_ti', NULL, FALSE),
  ('erradicacion', 'Erradicación', 4, 'decision', 'Eliminar el malware y su persistencia, rotar credenciales privilegiadas, cerrar la VPN sin MFA y validar con barridos del EDR. Resolver D3.', 'analista_ti', NULL, FALSE),
  ('analisis_forense', 'Análisis forense', 4.5, 'accion', 'Analizar imágenes de disco y memoria para hallar la persistencia que hizo fallar la erradicación, corregirla y volver a erradicar.', 'analista_ti', 'erradicacion', TRUE),
  ('recuperacion', 'Recuperación', 5, 'decision', 'Reiniciar el oleoducto de forma manual y progresiva por tramos, validando presión y SCADA en cada uno; restaurar TI desde respaldos. Resolver D4.', 'operador_ot', NULL, FALSE),
  ('ruta_alternativa', 'Ruta alternativa', 5.5, 'accion', 'Coordinar transporte por camiones, exenciones regulatorias con el gobierno y comunicados públicos sobre el abastecimiento.', 'comunicaciones', 'servicio_restablecido', FALSE),
  ('servicio_restablecido', 'Servicio restablecido', 6, 'accion', 'Verificar que todos los tramos entregan con normalidad y que los sistemas de TI vuelven a operar.', 'operador_ot', 'cierre', FALSE),
  ('cierre', 'Cierre', 7, 'accion', 'Documentar lecciones aprendidas (MFA, segmentación TI/OT, respaldos, simulacros) y emitir el informe final.', 'coordinador', 'finalizado', FALSE),
  ('finalizado', 'Finalizado', 8, 'final', NULL, NULL, NULL, FALSE)
ON CONFLICT (clave) DO UPDATE SET
  nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, tipo = EXCLUDED.tipo,
  procedimiento = EXCLUDED.procedimiento, rol_responsable = EXCLUDED.rol_responsable,
  siguiente = EXCLUDED.siguiente, es_reintento = EXCLUDED.es_reintento;

-- Decisiones D1–D4 (rombos del diagrama)
INSERT INTO decisiones_plan (codigo, etapa, pregunta, destino_si, destino_no, accion_si, accion_no) VALUES
  ('D1', 'evaluacion', '¿El ataque puede propagarse a los sistemas OT?', 'contencion', 'contencion', 'Detener preventivamente el oleoducto y aislar las redes TI / OT', 'Mantener la operación con monitoreo reforzado y contener solo los equipos de TI'),
  ('D2', 'contencion', '¿Existen respaldos limpios y verificados?', 'erradicacion', 'erradicacion', 'Restaurar los sistemas desde copias de seguridad', 'Evaluar con asesoría legal y autoridades el pago del rescate y el uso de la herramienta de descifrado'),
  ('D3', 'erradicacion', '¿Sistemas seguros y validados para reiniciar?', 'recuperacion', 'analisis_forense', 'Reinicio progresivo y manual del oleoducto por tramos', 'Análisis forense y corrección adicional'),
  ('D4', 'recuperacion', '¿Hay riesgo de desabastecimiento de combustible?', 'ruta_alternativa', 'servicio_restablecido', 'Transporte por camiones, coordinación con el gobierno, exenciones regulatorias y comunicación pública', NULL)
ON CONFLICT (codigo) DO UPDATE SET
  etapa = EXCLUDED.etapa, pregunta = EXCLUDED.pregunta,
  destino_si = EXCLUDED.destino_si, destino_no = EXCLUDED.destino_no,
  accion_si = EXCLUDED.accion_si, accion_no = EXCLUDED.accion_no;

-- Recursos tecnológicos del plan
INSERT INTO recursos_tecnologicos (codigo, nombre, categoria, descripcion) VALUES
  ('R01', 'EDR / antivirus corporativo', 'herramienta', 'Detección y respuesta en equipos; barridos para validar la erradicación.'),
  ('R02', 'SIEM y registros centralizados', 'herramienta', 'Correlación de alertas y evidencia de la actividad anómala.'),
  ('R03', 'Firewall y segmentación TI/OT', 'infraestructura', 'Permite aislar la red operativa de la red corporativa.'),
  ('R04', 'Respaldos offline inmutables', 'infraestructura', 'Copias fuera de línea verificadas para restaurar sin pagar rescate.'),
  ('R05', 'Herramienta de descifrado', 'herramienta', 'Descifrador obtenido tras el pago o de las autoridades; lento, se usa como apoyo.'),
  ('R06', 'Kit forense (disco y memoria)', 'herramienta', 'Imágenes forenses para hallar persistencia y preservar evidencia.'),
  ('R07', 'Gestión de identidades con MFA', 'infraestructura', 'Rotación de credenciales y segundo factor obligatorio en la VPN.'),
  ('R08', 'Canal de comunicación fuera de banda', 'infraestructura', 'Teléfonos y chat alterno por si el correo corporativo está comprometido.'),
  ('R09', 'Contactos de FBI, CISA y Dpto. de Energía', 'servicio_externo', 'Notificación obligatoria y apoyo de las autoridades.'),
  ('R10', 'Proveedor de respuesta a incidentes', 'servicio_externo', 'Equipo especializado externo (en el caso real, Mandiant).'),
  ('R11', 'Asesoría legal y seguro cibernético', 'servicio_externo', 'Evalúa el pago del rescate, obligaciones regulatorias y cobertura.'),
  ('R12', 'Flota de camiones y acuerdos logísticos', 'servicio_externo', 'Ruta alternativa de suministro mientras el oleoducto está detenido.'),
  ('R13', 'Procedimientos de operación manual (SCADA)', 'documento', 'Guía para reiniciar cada tramo de forma manual y segura.'),
  ('R14', 'Centro de Contingencia (este sistema)', 'herramienta', 'Registro del incidente, decisiones, acciones y estado de servicios.'),
  ('R15', 'Plantillas de comunicación pública', 'documento', 'Comunicados preaprobados para clientes, prensa y gobierno.')
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, categoria = EXCLUDED.categoria, descripcion = EXCLUDED.descripcion;

-- Recursos por etapa (N:M)
INSERT INTO etapa_recursos (etapa, recurso_id)
SELECT v.etapa, r.id
  FROM (VALUES
  ('deteccion', 'R01'),
  ('deteccion', 'R02'),
  ('deteccion', 'R14'),
  ('evaluacion', 'R02'),
  ('evaluacion', 'R08'),
  ('evaluacion', 'R14'),
  ('contencion', 'R03'),
  ('contencion', 'R07'),
  ('contencion', 'R09'),
  ('contencion', 'R10'),
  ('erradicacion', 'R01'),
  ('erradicacion', 'R06'),
  ('erradicacion', 'R07'),
  ('erradicacion', 'R10'),
  ('analisis_forense', 'R02'),
  ('analisis_forense', 'R06'),
  ('analisis_forense', 'R10'),
  ('recuperacion', 'R04'),
  ('recuperacion', 'R05'),
  ('recuperacion', 'R13'),
  ('ruta_alternativa', 'R09'),
  ('ruta_alternativa', 'R12'),
  ('ruta_alternativa', 'R15'),
  ('servicio_restablecido', 'R13'),
  ('servicio_restablecido', 'R14'),
  ('cierre', 'R11'),
  ('cierre', 'R14')
  ) AS v (etapa, codigo)
  JOIN recursos_tecnologicos r ON r.codigo = v.codigo
ON CONFLICT DO NOTHING;

-- Usuarios (actores del plan). Contraseña inicial de demostración: ver server/src/db/seedData.js.
-- Si la cuenta ya existe, solo completa la contraseña cuando aún no tiene una.
INSERT INTO usuarios (nombre, email, rol, clave_hash) VALUES
  ('María Torres', 'mtorres@colonial.local', 'coordinador', 'scrypt$32768$8$3$STv3RauCtEdRUyf7J+hhwg==$DPzzgy0QzL24zL4xr+rBTpbtEOgetmmbD85Xd/hkRFKKDTAGa6L+179uTZ2pK05HjRQXp1/4IbpPAoAfqF8MyQ=='),
  ('Javier Ríos', 'jrios@colonial.local', 'analista_ti', 'scrypt$32768$8$3$1ikNr6F6EdSqXh4ukbhHKA==$YKkiHYhtOV1FrFS9rY8LO8R1eh/1jpYZCac3gNLvkQ2XsesHM49+Y6J5aTJ1mHI7L/FDGdpq5bn97Oz75tWpFg=='),
  ('Lucía Paredes', 'lparedes@colonial.local', 'operador_ot', 'scrypt$32768$8$3$tadMTW4+0ZDdVNBI4PveCA==$fgEv0btTg3t3/PXAz3pRs9BFpzl3tLoLglKYWCUOzCVoMUsLeX8pAmLtArj/QcbtfanWmomzdQkPe5mXGwzINw=='),
  ('Andrés Salinas', 'asalinas@colonial.local', 'legal', 'scrypt$32768$8$3$mLhKXJKYHbmnrdapiCL7CA==$s9oyar+ZhSkRcRPsu9fHAL4gm+kx8gFNGDPWuXJOfNb3EJg8sDXGIQD8n6Huf2HC8vM+slV38gYIYdfFRFWBfA=='),
  ('Carla Méndez', 'cmendez@colonial.local', 'comunicaciones', 'scrypt$32768$8$3$tjaknJ7RiEgqTSTQdo7sjA==$SgLIrJdmoUg45iCUfWc2bj+ESVWHvRl0pRY6cPc7NT5qN+gNhgkMwhLoQI0nw+E7Yaxg5s6dphaj8LPMW+tvxQ==')
ON CONFLICT (email) DO UPDATE SET clave_hash = COALESCE(usuarios.clave_hash, EXCLUDED.clave_hash);

-- Servicios TI / OT del oleoducto
INSERT INTO servicios (codigo, nombre, tipo, criticidad, descripcion) VALUES
  ('OT-T1', 'Tramo 1: Houston – Atlanta', 'OT', 5, 'Línea principal de gasolina y diésel desde la costa del Golfo.'),
  ('OT-T2', 'Tramo 2: Atlanta – Greensboro', 'OT', 5, 'Distribución hacia el sureste.'),
  ('OT-T3', 'Tramo 3: Greensboro – Linden', 'OT', 5, 'Entrega hacia la costa este y Nueva Jersey.'),
  ('OT-SCADA', 'SCADA / control de bombeo', 'OT', 5, 'Supervisión y control de estaciones de bombeo.'),
  ('TI-FACT', 'Facturación a clientes', 'TI', 4, 'Sistema de facturación por volumen entregado.'),
  ('TI-ERP', 'ERP corporativo', 'TI', 4, 'Finanzas, compras y logística.'),
  ('TI-VPN', 'VPN de acceso remoto', 'TI', 3, 'Acceso remoto de empleados (vector de entrada del ataque).'),
  ('TI-AD', 'Directorio activo / identidades', 'TI', 4, 'Autenticación y gestión de cuentas.'),
  ('TI-MAIL', 'Correo corporativo', 'TI', 2, 'Comunicación interna y externa.'),
  ('TI-BKP', 'Plataforma de respaldos', 'TI', 5, 'Copias de seguridad de sistemas TI.')
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
