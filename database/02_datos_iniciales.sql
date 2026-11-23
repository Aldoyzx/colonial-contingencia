-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  02 · Datos iniciales: catálogo del plan, recursos, usuarios, servicios, ubicaciones y activos
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

-- Instalaciones de la red (distancias aproximadas, con fines académicos)
INSERT INTO ubicaciones (codigo, nombre, tipo, ciudad, estado_eeuu, km_aprox, servicio_id, descripcion)
SELECT v.codigo, v.nombre, v.tipo::tipo_ubicacion, v.ciudad, v.estado, v.km::SMALLINT, s.id, v.descripcion
  FROM (VALUES
  ('HOU', 'Origen Houston', 'patio_tanques', 'Pasadena', 'TX', 0, 'OT-T1', 'Origen de la línea principal: recibe gasolina, diésel y jet fuel de las refinerías del golfo de México.'),
  ('LCH', 'Lake Charles', 'estacion_bombeo', 'Lake Charles', 'LA', 230, 'OT-T1', 'Inyección de producto de las refinerías del oeste de Luisiana.'),
  ('BTR', 'Baton Rouge', 'estacion_bombeo', 'Baton Rouge', 'LA', 430, 'OT-T1', 'Inyección de producto de las refinerías del río Misisipi.'),
  ('COL', 'Collins', 'patio_tanques', 'Collins', 'MS', 650, 'OT-T1', 'Gran patio de tanques; desde aquí se bombea hacia el noreste.'),
  ('ATL', 'Atlanta', 'patio_tanques', 'Atlanta', 'GA', 1130, 'OT-T1', 'Entregas al mercado de Georgia y paso hacia las Carolinas.'),
  ('CLT', 'Charlotte', 'estacion_bombeo', 'Charlotte', 'NC', 1490, 'OT-T2', 'Entregas a las Carolinas.'),
  ('GSO', 'Greensboro', 'patio_tanques', 'Greensboro', 'NC', 1650, 'OT-T2', 'Nudo principal donde la red se divide hacia el noreste.'),
  ('RIC', 'Richmond', 'estacion_bombeo', 'Richmond', 'VA', 1960, 'OT-T3', 'Entregas en Virginia.'),
  ('DOR', 'Dorsey Junction', 'patio_tanques', 'Woodbine', 'MD', 2160, 'OT-T3', 'Entregas al área de Baltimore y Washington D. C.'),
  ('LIN', 'Linden', 'terminal', 'Linden', 'NJ', 2460, 'OT-T3', 'Terminal final hacia el puerto de Nueva York.'),
  ('ALP', 'Centro de control', 'centro_control', 'Alpharetta', 'GA', NULL, 'OT-SCADA', 'Sede de la empresa y centro de control desde donde se opera SCADA.'),
  ('ADC', 'Centro de datos corporativo', 'centro_datos', 'Alpharetta', 'GA', NULL, NULL, 'Sala de servidores de TI (ubicación referencial: la real no es pública).')
  ) AS v (codigo, nombre, tipo, ciudad, estado, km, servicio, descripcion)
  LEFT JOIN servicios s ON s.codigo = v.servicio
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, ciudad = EXCLUDED.ciudad, estado_eeuu = EXCLUDED.estado_eeuu,
  km_aprox = EXCLUDED.km_aprox, servicio_id = EXCLUDED.servicio_id, descripcion = EXCLUDED.descripcion;

-- Activos por rack (plataformas de referencia). El estado de aislamiento no se toca al resincronizar.
INSERT INTO activos (codigo, nombre, plataforma, funcion, red, servicio_id, ubicacion_id, rack, u_inicio, u_alto, criticidad,
                     expuesto_internet, sin_mfa, sin_soporte, privilegiado)
SELECT v.codigo, v.nombre, v.plataforma, v.funcion, v.red::tipo_servicio, s.id, u.id, v.rack, v.u::SMALLINT, v.alto::SMALLINT,
       v.criticidad::SMALLINT, v.expuesto, v.sin_mfa, v.sin_soporte, v.privilegiado
  FROM (VALUES
  ('FW-PERIM01', 'Firewall perimetral', 'Firewall de nueva generación (NGFW) en clúster', 'Filtra el tráfico entre Internet y la red corporativa.', 'TI', NULL, 'ADC', 'A01', 40, 2, 5, TRUE, FALSE, FALSE, FALSE),
  ('VPN-LEGADO', 'VPN SSL heredada', 'Concentrador VPN SSL con usuario y contraseña', 'Cuenta de acceso remoto antigua que seguía activa: vector de entrada del caso real.', 'TI', 'TI-VPN', 'ADC', 'A01', 37, 1, 3, TRUE, TRUE, TRUE, FALSE),
  ('VPN-GW01', 'Gateway VPN con MFA', 'Concentrador VPN + RADIUS con código TOTP', 'Acceso remoto vigente de los empleados.', 'TI', 'TI-VPN', 'ADC', 'A01', 36, 1, 4, TRUE, FALSE, FALSE, FALSE),
  ('SW-CORE01', 'Switch núcleo', 'Switch L3 de núcleo (par redundante)', 'Interconecta los racks de la red corporativa.', 'TI', NULL, 'ADC', 'A01', 33, 2, 5, FALSE, FALSE, FALSE, FALSE),
  ('PRX-WEB01', 'Proxy web', 'Proxy y filtro de navegación', 'Navegación segura de los empleados.', 'TI', NULL, 'ADC', 'A01', 31, 1, 2, TRUE, FALSE, FALSE, FALSE),
  ('SEC-SIEM01', 'SIEM', 'SIEM con correlación de registros', 'Centraliza los registros y alertas de seguridad.', 'TI', NULL, 'ADC', 'A01', 28, 2, 4, FALSE, FALSE, FALSE, FALSE),
  ('SEC-EDR01', 'Consola EDR', 'Plataforma EDR (consola de gestión)', 'Detecta y contiene malware en servidores y equipos.', 'TI', NULL, 'ADC', 'A01', 26, 1, 4, FALSE, FALSE, FALSE, TRUE),
  ('AD-DC01', 'Controlador de dominio 1', 'Windows Server 2019 · Active Directory', 'Autenticación y políticas de todas las cuentas.', 'TI', 'TI-AD', 'ADC', 'A02', 40, 1, 5, FALSE, FALSE, FALSE, TRUE),
  ('AD-DC02', 'Controlador de dominio 2', 'Windows Server 2019 · Active Directory', 'Réplica del dominio para alta disponibilidad.', 'TI', 'TI-AD', 'ADC', 'A02', 39, 1, 5, FALSE, FALSE, FALSE, TRUE),
  ('PKI-CA01', 'Autoridad certificadora', 'Windows Server · AD Certificate Services', 'Certificados internos de servidores y de la VPN.', 'TI', 'TI-AD', 'ADC', 'A02', 37, 1, 4, FALSE, FALSE, FALSE, TRUE),
  ('MAIL-EX01', 'Servidor de correo', 'Microsoft Exchange Server', 'Correo corporativo interno y externo.', 'TI', 'TI-MAIL', 'ADC', 'A02', 34, 2, 2, TRUE, FALSE, FALSE, FALSE),
  ('FS-01', 'Servidor de archivos', 'Windows Server · DFS', 'Carpetas compartidas de las áreas.', 'TI', NULL, 'ADC', 'A02', 31, 2, 3, FALSE, FALSE, FALSE, FALSE),
  ('ERP-APP01', 'ERP · aplicación', 'SAP S/4HANA (servidor de aplicaciones)', 'Finanzas, compras y logística.', 'TI', 'TI-ERP', 'ADC', 'A03', 38, 2, 4, FALSE, FALSE, FALSE, FALSE),
  ('ERP-DB01', 'ERP · base de datos', 'SAP HANA', 'Base de datos en memoria del ERP.', 'TI', 'TI-ERP', 'ADC', 'A03', 34, 3, 4, FALSE, FALSE, FALSE, TRUE),
  ('FACT-APP01', 'Facturación · aplicación', 'Aplicación de facturación por volumen (desarrollo propio)', 'Calcula y emite las facturas de lo entregado a cada cliente.', 'TI', 'TI-FACT', 'ADC', 'A03', 30, 2, 4, FALSE, FALSE, FALSE, FALSE),
  ('FACT-DB01', 'Facturación · base de datos', 'Microsoft SQL Server', 'Clientes, contratos y volúmenes medidos.', 'TI', 'TI-FACT', 'ADC', 'A03', 27, 2, 4, FALSE, FALSE, FALSE, FALSE),
  ('FACT-WEB01', 'Portal de clientes', 'Portal web de transportistas (IIS)', 'Consulta de entregas y facturas por los clientes.', 'TI', 'TI-FACT', 'ADC', 'A03', 25, 1, 3, TRUE, FALSE, FALSE, FALSE),
  ('VMW-VC01', 'vCenter', 'VMware vCenter Server', 'Administra los hosts de virtualización.', 'TI', NULL, 'ADC', 'A04', 40, 1, 5, FALSE, FALSE, FALSE, TRUE),
  ('VMW-ESX01', 'Host de virtualización 1', 'VMware ESXi (servidor 2U)', 'Ejecuta las máquinas virtuales de TI.', 'TI', NULL, 'ADC', 'A04', 36, 2, 5, FALSE, FALSE, FALSE, FALSE),
  ('VMW-ESX02', 'Host de virtualización 2', 'VMware ESXi (servidor 2U)', 'Ejecuta las máquinas virtuales de TI.', 'TI', NULL, 'ADC', 'A04', 34, 2, 5, FALSE, FALSE, FALSE, FALSE),
  ('VMW-ESX03', 'Host de virtualización 3', 'VMware ESXi (servidor 2U)', 'Capacidad de reserva para recuperar servicios.', 'TI', NULL, 'ADC', 'A04', 32, 2, 4, FALSE, FALSE, FALSE, FALSE),
  ('BKP-VBR01', 'Servidor de respaldos', 'Veeam Backup & Replication', 'Orquesta las copias de seguridad.', 'TI', 'TI-BKP', 'ADC', 'A04', 28, 1, 5, FALSE, FALSE, FALSE, TRUE),
  ('BKP-REPO01', 'Repositorio inmutable', 'Repositorio Linux endurecido (copias inmutables)', 'Copias que no se pueden borrar ni cifrar durante su retención.', 'TI', 'TI-BKP', 'ADC', 'A04', 23, 4, 5, FALSE, FALSE, FALSE, FALSE),
  ('BKP-LTO01', 'Librería de cintas', 'Librería de cintas LTO (copia fuera de línea)', 'Copia desconectada de la red (regla 3-2-1).', 'TI', 'TI-BKP', 'ADC', 'A04', 18, 3, 4, FALSE, FALSE, FALSE, FALSE),
  ('OT-FW01', 'Firewall TI/OT', 'Firewall industrial (DMZ entre TI y OT)', 'Única puerta entre la red corporativa y la red de control.', 'OT', 'OT-SCADA', 'ALP', 'B01', 40, 1, 5, FALSE, FALSE, FALSE, FALSE),
  ('SCD-P01', 'SCADA · primario', 'Servidor SCADA de oleoductos (redundante)', 'Supervisa presiones, caudales y válvulas en tiempo real.', 'OT', 'OT-SCADA', 'ALP', 'B01', 37, 2, 5, FALSE, FALSE, FALSE, TRUE),
  ('SCD-S01', 'SCADA · respaldo', 'Servidor SCADA de oleoductos (redundante)', 'Toma el control si falla el primario.', 'OT', 'OT-SCADA', 'ALP', 'B01', 34, 2, 5, FALSE, FALSE, FALSE, TRUE),
  ('HIS-PI01', 'Historian', 'AVEVA PI Server (historian)', 'Historia de presiones y caudales de cada tramo.', 'OT', 'OT-SCADA', 'ALP', 'B01', 31, 2, 4, FALSE, FALSE, FALSE, FALSE),
  ('LDS-01', 'Detección de fugas', 'Sistema de detección de fugas (modelo hidráulico en línea)', 'Compara caudales para detectar fugas.', 'OT', 'OT-SCADA', 'ALP', 'B01', 28, 1, 5, FALSE, FALSE, FALSE, FALSE),
  ('HMI-01', 'Consola de operador 1', 'Estación HMI de operación', 'Pantallas de los operadores del centro de control.', 'OT', 'OT-SCADA', 'ALP', 'B01', 25, 1, 4, FALSE, FALSE, FALSE, FALSE),
  ('HMI-02', 'Consola de operador 2', 'Estación HMI de operación', 'Pantallas de los operadores del centro de control.', 'OT', 'OT-SCADA', 'ALP', 'B01', 24, 1, 4, FALSE, FALSE, FALSE, FALSE),
  ('ENG-WS01', 'Estación de ingeniería', 'Estación de programación de PLC/RTU', 'Modifica la lógica de control: acceso muy restringido.', 'OT', 'OT-SCADA', 'ALP', 'B01', 22, 1, 5, FALSE, FALSE, FALSE, TRUE),
  ('FEP-01', 'Procesador de comunicaciones', 'Front-end processor DNP3/Modbus', 'Habla con las RTU de las estaciones de bombeo.', 'OT', 'OT-SCADA', 'ALP', 'B02', 40, 2, 5, FALSE, FALSE, FALSE, FALSE),
  ('RTU-T1', 'Enlace de campo · Tramo 1', 'Router industrial + enlace MPLS/satelital', 'Comunicación con las estaciones Houston–Atlanta.', 'OT', 'OT-T1', 'ALP', 'B02', 36, 1, 5, FALSE, FALSE, FALSE, FALSE),
  ('RTU-T2', 'Enlace de campo · Tramo 2', 'Router industrial + enlace MPLS/satelital', 'Comunicación con las estaciones Atlanta–Greensboro.', 'OT', 'OT-T2', 'ALP', 'B02', 35, 1, 5, FALSE, FALSE, FALSE, FALSE),
  ('RTU-T3', 'Enlace de campo · Tramo 3', 'Router industrial + enlace MPLS/satelital', 'Comunicación con las estaciones Greensboro–Linden.', 'OT', 'OT-T3', 'ALP', 'B02', 34, 1, 5, FALSE, FALSE, FALSE, FALSE),
  ('MED-01', 'Medición fiscal', 'Servidor de medición de transferencia de custodia', 'Volúmenes entregados a cada cliente: la facturación depende de estos datos.', 'OT', 'TI-FACT', 'ALP', 'B02', 31, 2, 5, FALSE, FALSE, FALSE, FALSE),
  ('NTP-OT01', 'Reloj GPS', 'Servidor de tiempo GPS', 'Sincroniza la hora de SCADA y de la medición.', 'OT', NULL, 'ALP', 'B02', 29, 1, 3, FALSE, FALSE, FALSE, FALSE)
  ) AS v (codigo, nombre, plataforma, funcion, red, servicio, ubicacion, rack, u, alto, criticidad, expuesto, sin_mfa, sin_soporte, privilegiado)
  JOIN ubicaciones u ON u.codigo = v.ubicacion
  LEFT JOIN servicios s ON s.codigo = v.servicio
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, plataforma = EXCLUDED.plataforma, funcion = EXCLUDED.funcion, red = EXCLUDED.red,
  servicio_id = EXCLUDED.servicio_id, ubicacion_id = EXCLUDED.ubicacion_id, rack = EXCLUDED.rack,
  u_inicio = EXCLUDED.u_inicio, u_alto = EXCLUDED.u_alto, criticidad = EXCLUDED.criticidad,
  expuesto_internet = EXCLUDED.expuesto_internet, sin_mfa = EXCLUDED.sin_mfa,
  sin_soporte = EXCLUDED.sin_soporte, privilegiado = EXCLUDED.privilegiado;

COMMIT;
