-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  04 · Registros de prueba: el incidente real del 7 al 20 de mayo de 2021, cerrado
--  Gestor: PostgreSQL 16 · Requiere 01_esquema.sql y 02_datos_iniciales.sql
--
--  psql -U contingencia -d contingencia -f database/04_datos_prueba.sql
--  (equivale a: cd server && npm run db:demo, que además reinicia la base)
--  Ejecutar una sola vez: el código INC-2021-0001 es único.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_coord   INTEGER := (SELECT id FROM usuarios WHERE email = 'mtorres@colonial.local');
  v_ti      INTEGER := (SELECT id FROM usuarios WHERE email = 'jrios@colonial.local');
  v_ot      INTEGER := (SELECT id FROM usuarios WHERE email = 'lparedes@colonial.local');
  v_legal   INTEGER := (SELECT id FROM usuarios WHERE email = 'asalinas@colonial.local');
  v_com     INTEGER := (SELECT id FROM usuarios WHERE email = 'cmendez@colonial.local');
  v_inc     INTEGER;
BEGIN
  INSERT INTO incidentes (codigo, titulo, descripcion, severidad, etapa, estado, intentos_erradicacion,
                          lecciones_aprendidas, responsable_id, creado_por, detectado_en, cerrado_en)
  VALUES ('INC-2021-0001',
          'Ransomware DarkSide en red corporativa',
          'Un empleado encontró la nota de rescate en sistemas de TI. Acceso inicial por una cuenta de VPN antigua sin MFA cuya contraseña se había filtrado.',
          'critica', 'finalizado', 'cerrado', 0,
          'Exigir MFA en todo acceso remoto, desactivar cuentas inactivas, segmentar TI/OT, mantener respaldos offline verificados y ensayar el plan con simulacros trimestrales.',
          v_coord, v_ti, '2021-05-07 05:40-04', '2021-05-20 12:00-04')
  RETURNING id INTO v_inc;

  INSERT INTO incidente_servicios (incidente_id, servicio_id, vinculado_en)
  SELECT v_inc, id, CASE WHEN tipo = 'TI' THEN '2021-05-07 05:40-04'::timestamptz ELSE '2021-05-07 06:15-04'::timestamptz END
    FROM servicios WHERE codigo IN ('TI-FACT', 'TI-VPN', 'TI-AD', 'OT-T1', 'OT-T2', 'OT-T3', 'OT-SCADA');

  INSERT INTO acciones (incidente_id, etapa, origen, descripcion, responsable_id, estado, resultado, creada_en, actualizada_en) VALUES
    (v_inc, 'deteccion',    'entrada:deteccion',    'Confirmar nota de rescate y actividad anómala en sistemas TI', v_ti, 'completada', 'Nota de DarkSide confirmada en servidores de facturación', '2021-05-07 05:40-04', '2021-05-07 05:55-04'),
    (v_inc, 'evaluacion',   'entrada:evaluacion',   'Activar equipo de respuesta; medir alcance, sistemas afectados y riesgo para la red OT', v_coord, 'completada', 'Comité de crisis activo; ~100 GB exfiltrados', '2021-05-07 06:00-04', '2021-05-07 06:10-04'),
    (v_inc, 'contencion',   'D1:si',                'Detener preventivamente el oleoducto y aislar las redes TI / OT', v_ot, 'completada', '8 850 km de oleoducto detenidos por primera vez en 57 años', '2021-05-07 06:15-04', '2021-05-07 07:00-04'),
    (v_inc, 'contencion',   'entrada:contencion',   'Desconectar equipos, bloquear accesos y notificar a FBI, CISA y Dpto. de Energía', v_ti, 'completada', 'Autoridades notificadas; Mandiant contratada', '2021-05-07 06:15-04', '2021-05-07 18:00-04'),
    (v_inc, 'erradicacion', 'entrada:erradicacion', 'Eliminar el malware, rotar credenciales y cerrar la vía de acceso (VPN sin MFA)', v_ti, 'completada', 'Cuenta VPN deshabilitada y credenciales rotadas', '2021-05-08 10:00-04', '2021-05-11 20:00-04'),
    (v_inc, 'erradicacion', 'D2:no',                'Evaluar con asesoría legal y autoridades el pago del rescate y el uso de la herramienta de descifrado', v_legal, 'completada', 'Pago de 75 BTC (~4,4 M USD); el descifrador fue lento y se combinó con respaldos', '2021-05-08 10:00-04', '2021-05-08 16:00-04'),
    (v_inc, 'recuperacion', 'D3:si',                'Reinicio progresivo y manual del oleoducto por tramos', v_ot, 'completada', 'Reinicio iniciado a las 17:00 del 12 de mayo', '2021-05-12 17:00-04', '2021-05-13 17:00-04'),
    (v_inc, 'ruta_alternativa', 'D4:si',            'Transporte por camiones, coordinación con el gobierno, exenciones regulatorias y comunicación pública', v_com, 'completada', 'Exención temporal de horas de conducción y comunicados diarios', '2021-05-12 17:30-04', '2021-05-13 12:00-04'),
    (v_inc, 'servicio_restablecido', 'entrada:servicio_restablecido', 'Verificar normalización de entregas en todos los tramos', v_ot, 'completada', 'Entregas normalizadas en todos los mercados', '2021-05-13 17:00-04', '2021-05-15 12:00-04'),
    (v_inc, 'cierre',       'entrada:cierre',       'Documentar lecciones aprendidas: MFA, segmentación TI/OT, plan de continuidad y simulacros', v_coord, 'completada', 'Informe final emitido', '2021-05-15 12:00-04', '2021-05-20 12:00-04');

  INSERT INTO decisiones (incidente_id, codigo, pregunta, respuesta, justificacion, etapa_origen, etapa_destino, usuario_id, tomada_en) VALUES
    (v_inc, 'D1', '¿El ataque puede propagarse a los sistemas OT?', TRUE,  'No hay certeza de que la red OT esté aislada; se detiene por precaución', 'evaluacion', 'contencion', v_coord, '2021-05-07 06:15-04'),
    (v_inc, 'D2', '¿Existen respaldos limpios y verificados?', FALSE, 'Respaldos sin verificar; se evalúa el descifrado con FBI y asesoría legal', 'contencion', 'erradicacion', v_coord, '2021-05-08 10:00-04'),
    (v_inc, 'D3', '¿Sistemas seguros y validados para reiniciar?', TRUE, 'Barridos de Mandiant limpios; VPN cerrada', 'erradicacion', 'recuperacion', v_coord, '2021-05-12 17:00-04'),
    (v_inc, 'D4', '¿Hay riesgo de desabastecimiento de combustible?', TRUE, 'Compras de pánico y estaciones sin combustible en el sureste', 'recuperacion', 'ruta_alternativa', v_coord, '2021-05-12 17:30-04');

  INSERT INTO historial_recuperacion (incidente_id, servicio_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, fecha)
  SELECT v_inc, s.id, h.evento, h.anterior, h.nuevo, h.detalle, h.usuario, h.fecha::timestamptz
    FROM (VALUES
      (NULL,       'incidente_registrado',  NULL,               'deteccion',        'INC-2021-0001: Ransomware DarkSide en red corporativa', v_ti,    '2021-05-07 05:40-04'),
      ('TI-FACT',  'servicio_afectado',     'operativo',        'afectado',         'Afectado por INC-2021-0001', v_ti,    '2021-05-07 05:40-04'),
      ('TI-VPN',   'servicio_afectado',     'operativo',        'afectado',         'Afectado por INC-2021-0001', v_ti,    '2021-05-07 05:40-04'),
      ('TI-AD',    'servicio_afectado',     'operativo',        'afectado',         'Afectado por INC-2021-0001', v_ti,    '2021-05-07 05:40-04'),
      (NULL,       'decision',              'evaluacion',       'contencion',       'D1 → Sí. Se detiene la red OT por precaución', v_coord, '2021-05-07 06:15-04'),
      ('OT-T1',    'detencion_preventiva',  'operativo',        'afectado',         'Detenido preventivamente (aislamiento TI/OT)', v_coord, '2021-05-07 06:15-04'),
      ('OT-T2',    'detencion_preventiva',  'operativo',        'afectado',         'Detenido preventivamente (aislamiento TI/OT)', v_coord, '2021-05-07 06:15-04'),
      ('OT-T3',    'detencion_preventiva',  'operativo',        'afectado',         'Detenido preventivamente (aislamiento TI/OT)', v_coord, '2021-05-07 06:15-04'),
      ('OT-SCADA', 'detencion_preventiva',  'operativo',        'afectado',         'Detenido preventivamente (aislamiento TI/OT)', v_coord, '2021-05-07 06:15-04'),
      (NULL,       'decision',              'contencion',       'erradicacion',     'D2 → No. Respaldos sin verificar', v_coord, '2021-05-08 10:00-04'),
      (NULL,       'decision',              'erradicacion',     'recuperacion',     'D3 → Sí. Sistemas validados', v_coord, '2021-05-12 17:00-04'),
      ('OT-T1',    'inicio_recuperacion',   'afectado',         'en_recuperacion',  'Reinicio progresivo en curso', v_coord, '2021-05-12 17:00-04'),
      ('OT-T2',    'inicio_recuperacion',   'afectado',         'en_recuperacion',  'Reinicio progresivo en curso', v_coord, '2021-05-12 17:00-04'),
      ('OT-T3',    'inicio_recuperacion',   'afectado',         'en_recuperacion',  'Reinicio progresivo en curso', v_coord, '2021-05-12 17:00-04'),
      ('OT-SCADA', 'inicio_recuperacion',   'afectado',         'en_recuperacion',  'Reinicio progresivo en curso', v_coord, '2021-05-12 17:00-04'),
      (NULL,       'decision',              'recuperacion',     'ruta_alternativa', 'D4 → Sí. Riesgo de desabastecimiento', v_coord, '2021-05-12 17:30-04'),
      ('OT-T1',    'servicio_restablecido', 'en_recuperacion',  'operativo',        NULL, v_ot,    '2021-05-13 17:00-04'),
      ('OT-T2',    'servicio_restablecido', 'en_recuperacion',  'operativo',        NULL, v_ot,    '2021-05-13 17:00-04'),
      ('OT-T3',    'servicio_restablecido', 'en_recuperacion',  'operativo',        NULL, v_ot,    '2021-05-13 17:00-04'),
      ('OT-SCADA', 'servicio_restablecido', 'en_recuperacion',  'operativo',        NULL, v_ot,    '2021-05-13 17:00-04'),
      ('TI-FACT',  'servicio_restablecido', 'afectado',         'operativo',        NULL, v_ti,    '2021-05-13 17:00-04'),
      ('TI-VPN',   'servicio_restablecido', 'afectado',         'operativo',        'Reabierta con MFA obligatorio', v_ti, '2021-05-13 17:00-04'),
      ('TI-AD',    'servicio_restablecido', 'afectado',         'operativo',        NULL, v_ti,    '2021-05-13 17:00-04'),
      (NULL,       'incidente_cerrado',     'cierre',           'finalizado',       'Lecciones aprendidas registradas', v_coord, '2021-05-20 12:00-04')
    ) AS h (codigo, evento, anterior, nuevo, detalle, usuario, fecha)
    LEFT JOIN servicios s ON s.codigo = h.codigo;
END $$;

-- Los próximos incidentes continúan la numeración (INC-AAAA-0002 en adelante).
SELECT setval('incidente_numero_seq', (SELECT max(id) FROM incidentes));

COMMIT;
