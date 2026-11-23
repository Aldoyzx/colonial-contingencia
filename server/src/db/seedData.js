/** Datos maestros: actores del plan y activos TI/OT del oleoducto. */

/**
 * Contraseña inicial de las cuentas de demostración. Cada usuario debe cambiarla en
 * "Mi cuenta"; en producción, MOSTRAR_CUENTAS_DEMO=false oculta las cuentas en el acceso.
 */
export const DEMO_PASSWORD = 'Colonial2021!';
export const USERS = Object.freeze([
  { nombre: 'María Torres', email: 'mtorres@colonial.local', rol: 'coordinador' },
  { nombre: 'Javier Ríos', email: 'jrios@colonial.local', rol: 'analista_ti' },
  { nombre: 'Lucía Paredes', email: 'lparedes@colonial.local', rol: 'operador_ot' },
  { nombre: 'Andrés Salinas', email: 'asalinas@colonial.local', rol: 'legal' },
  { nombre: 'Carla Méndez', email: 'cmendez@colonial.local', rol: 'comunicaciones' },
]);

export const SERVICES = Object.freeze([
  { codigo: 'OT-T1', nombre: 'Tramo 1: Houston – Atlanta', tipo: 'OT', criticidad: 5, descripcion: 'Línea principal de gasolina y diésel desde la costa del Golfo.' },
  { codigo: 'OT-T2', nombre: 'Tramo 2: Atlanta – Greensboro', tipo: 'OT', criticidad: 5, descripcion: 'Distribución hacia el sureste.' },
  { codigo: 'OT-T3', nombre: 'Tramo 3: Greensboro – Linden', tipo: 'OT', criticidad: 5, descripcion: 'Entrega hacia la costa este y Nueva Jersey.' },
  { codigo: 'OT-SCADA', nombre: 'SCADA / control de bombeo', tipo: 'OT', criticidad: 5, descripcion: 'Supervisión y control de estaciones de bombeo.' },
  { codigo: 'TI-FACT', nombre: 'Facturación a clientes', tipo: 'TI', criticidad: 4, descripcion: 'Sistema de facturación por volumen entregado.' },
  { codigo: 'TI-ERP', nombre: 'ERP corporativo', tipo: 'TI', criticidad: 4, descripcion: 'Finanzas, compras y logística.' },
  { codigo: 'TI-VPN', nombre: 'VPN de acceso remoto', tipo: 'TI', criticidad: 3, descripcion: 'Acceso remoto de empleados (vector de entrada del ataque).' },
  { codigo: 'TI-AD', nombre: 'Directorio activo / identidades', tipo: 'TI', criticidad: 4, descripcion: 'Autenticación y gestión de cuentas.' },
  { codigo: 'TI-MAIL', nombre: 'Correo corporativo', tipo: 'TI', criticidad: 2, descripcion: 'Comunicación interna y externa.' },
  { codigo: 'TI-BKP', nombre: 'Plataforma de respaldos', tipo: 'TI', criticidad: 5, descripcion: 'Copias de seguridad de sistemas TI.' },
]);

/**
 * Instalaciones de la red de Colonial Pipeline (fuentes públicas). Las distancias desde
 * Houston son aproximadas y solo ordenan el esquema del mapa; no son datos de ingeniería.
 */
export const LOCATIONS = Object.freeze([
  { codigo: 'HOU', nombre: 'Origen Houston', tipo: 'patio_tanques', ciudad: 'Pasadena', estado: 'TX', km: 0, servicio: 'OT-T1', descripcion: 'Origen de la línea principal: recibe gasolina, diésel y jet fuel de las refinerías del golfo de México.' },
  { codigo: 'LCH', nombre: 'Lake Charles', tipo: 'estacion_bombeo', ciudad: 'Lake Charles', estado: 'LA', km: 230, servicio: 'OT-T1', descripcion: 'Inyección de producto de las refinerías del oeste de Luisiana.' },
  { codigo: 'BTR', nombre: 'Baton Rouge', tipo: 'estacion_bombeo', ciudad: 'Baton Rouge', estado: 'LA', km: 430, servicio: 'OT-T1', descripcion: 'Inyección de producto de las refinerías del río Misisipi.' },
  { codigo: 'COL', nombre: 'Collins', tipo: 'patio_tanques', ciudad: 'Collins', estado: 'MS', km: 650, servicio: 'OT-T1', descripcion: 'Gran patio de tanques; desde aquí se bombea hacia el noreste.' },
  { codigo: 'ATL', nombre: 'Atlanta', tipo: 'patio_tanques', ciudad: 'Atlanta', estado: 'GA', km: 1130, servicio: 'OT-T1', descripcion: 'Entregas al mercado de Georgia y paso hacia las Carolinas.' },
  { codigo: 'CLT', nombre: 'Charlotte', tipo: 'estacion_bombeo', ciudad: 'Charlotte', estado: 'NC', km: 1490, servicio: 'OT-T2', descripcion: 'Entregas a las Carolinas.' },
  { codigo: 'GSO', nombre: 'Greensboro', tipo: 'patio_tanques', ciudad: 'Greensboro', estado: 'NC', km: 1650, servicio: 'OT-T2', descripcion: 'Nudo principal donde la red se divide hacia el noreste.' },
  { codigo: 'RIC', nombre: 'Richmond', tipo: 'estacion_bombeo', ciudad: 'Richmond', estado: 'VA', km: 1960, servicio: 'OT-T3', descripcion: 'Entregas en Virginia.' },
  { codigo: 'DOR', nombre: 'Dorsey Junction', tipo: 'patio_tanques', ciudad: 'Woodbine', estado: 'MD', km: 2160, servicio: 'OT-T3', descripcion: 'Entregas al área de Baltimore y Washington D. C.' },
  { codigo: 'LIN', nombre: 'Linden', tipo: 'terminal', ciudad: 'Linden', estado: 'NJ', km: 2460, servicio: 'OT-T3', descripcion: 'Terminal final hacia el puerto de Nueva York.' },
  { codigo: 'ALP', nombre: 'Centro de control', tipo: 'centro_control', ciudad: 'Alpharetta', estado: 'GA', km: null, servicio: 'OT-SCADA', descripcion: 'Sede de la empresa y centro de control desde donde se opera SCADA.' },
  { codigo: 'ADC', nombre: 'Centro de datos corporativo', tipo: 'centro_datos', ciudad: 'Alpharetta', estado: 'GA', km: null, servicio: null, descripcion: 'Sala de servidores de TI (ubicación referencial: la real no es pública).' },
]);

/** Racks del mapa de calor del centro de datos (42 U cada uno). */
export const RACKS = Object.freeze([
  { codigo: 'A01', nombre: 'Perímetro y seguridad', ubicacion: 'ADC' },
  { codigo: 'A02', nombre: 'Identidad y correo', ubicacion: 'ADC' },
  { codigo: 'A03', nombre: 'Aplicaciones de negocio', ubicacion: 'ADC' },
  { codigo: 'A04', nombre: 'Virtualización y respaldos', ubicacion: 'ADC' },
  { codigo: 'B01', nombre: 'SCADA y control', ubicacion: 'ALP' },
  { codigo: 'B02', nombre: 'Comunicaciones de campo y medición', ubicacion: 'ALP' },
]);
export const RACK_UNITS = 42;

/**
 * Activos por rack. Las plataformas son productos típicos de un operador de oleoductos,
 * usados como referencia: el inventario real de Colonial no es público.
 * Banderas de riesgo: expuesto (a Internet), sinMfa, sinSoporte (fuera de soporte), privilegiado.
 */
const asset = (codigo, nombre, plataforma, funcion, red, servicio, ubicacion, rack, u, alto, criticidad, flags = {}) => ({
  codigo, nombre, plataforma, funcion, red, servicio, ubicacion, rack, u, alto, criticidad,
  expuesto: false, sinMfa: false, sinSoporte: false, privilegiado: false, ...flags,
});

export const ASSETS = Object.freeze([
  // A01 · Perímetro y seguridad
  asset('FW-PERIM01', 'Firewall perimetral', 'Firewall de nueva generación (NGFW) en clúster', 'Filtra el tráfico entre Internet y la red corporativa.', 'TI', null, 'ADC', 'A01', 40, 2, 5, { expuesto: true }),
  asset('VPN-LEGADO', 'VPN SSL heredada', 'Concentrador VPN SSL con usuario y contraseña', 'Cuenta de acceso remoto antigua que seguía activa: vector de entrada del caso real.', 'TI', 'TI-VPN', 'ADC', 'A01', 37, 1, 3, { expuesto: true, sinMfa: true, sinSoporte: true }),
  asset('VPN-GW01', 'Gateway VPN con MFA', 'Concentrador VPN + RADIUS con código TOTP', 'Acceso remoto vigente de los empleados.', 'TI', 'TI-VPN', 'ADC', 'A01', 36, 1, 4, { expuesto: true }),
  asset('SW-CORE01', 'Switch núcleo', 'Switch L3 de núcleo (par redundante)', 'Interconecta los racks de la red corporativa.', 'TI', null, 'ADC', 'A01', 33, 2, 5),
  asset('PRX-WEB01', 'Proxy web', 'Proxy y filtro de navegación', 'Navegación segura de los empleados.', 'TI', null, 'ADC', 'A01', 31, 1, 2, { expuesto: true }),
  asset('SEC-SIEM01', 'SIEM', 'SIEM con correlación de registros', 'Centraliza los registros y alertas de seguridad.', 'TI', null, 'ADC', 'A01', 28, 2, 4),
  asset('SEC-EDR01', 'Consola EDR', 'Plataforma EDR (consola de gestión)', 'Detecta y contiene malware en servidores y equipos.', 'TI', null, 'ADC', 'A01', 26, 1, 4, { privilegiado: true }),
  // A02 · Identidad y correo
  asset('AD-DC01', 'Controlador de dominio 1', 'Windows Server 2019 · Active Directory', 'Autenticación y políticas de todas las cuentas.', 'TI', 'TI-AD', 'ADC', 'A02', 40, 1, 5, { privilegiado: true }),
  asset('AD-DC02', 'Controlador de dominio 2', 'Windows Server 2019 · Active Directory', 'Réplica del dominio para alta disponibilidad.', 'TI', 'TI-AD', 'ADC', 'A02', 39, 1, 5, { privilegiado: true }),
  asset('PKI-CA01', 'Autoridad certificadora', 'Windows Server · AD Certificate Services', 'Certificados internos de servidores y de la VPN.', 'TI', 'TI-AD', 'ADC', 'A02', 37, 1, 4, { privilegiado: true }),
  asset('MAIL-EX01', 'Servidor de correo', 'Microsoft Exchange Server', 'Correo corporativo interno y externo.', 'TI', 'TI-MAIL', 'ADC', 'A02', 34, 2, 2, { expuesto: true }),
  asset('FS-01', 'Servidor de archivos', 'Windows Server · DFS', 'Carpetas compartidas de las áreas.', 'TI', null, 'ADC', 'A02', 31, 2, 3),
  // A03 · Aplicaciones de negocio
  asset('ERP-APP01', 'ERP · aplicación', 'SAP S/4HANA (servidor de aplicaciones)', 'Finanzas, compras y logística.', 'TI', 'TI-ERP', 'ADC', 'A03', 38, 2, 4),
  asset('ERP-DB01', 'ERP · base de datos', 'SAP HANA', 'Base de datos en memoria del ERP.', 'TI', 'TI-ERP', 'ADC', 'A03', 34, 3, 4, { privilegiado: true }),
  asset('FACT-APP01', 'Facturación · aplicación', 'Aplicación de facturación por volumen (desarrollo propio)', 'Calcula y emite las facturas de lo entregado a cada cliente.', 'TI', 'TI-FACT', 'ADC', 'A03', 30, 2, 4),
  asset('FACT-DB01', 'Facturación · base de datos', 'Microsoft SQL Server', 'Clientes, contratos y volúmenes medidos.', 'TI', 'TI-FACT', 'ADC', 'A03', 27, 2, 4),
  asset('FACT-WEB01', 'Portal de clientes', 'Portal web de transportistas (IIS)', 'Consulta de entregas y facturas por los clientes.', 'TI', 'TI-FACT', 'ADC', 'A03', 25, 1, 3, { expuesto: true }),
  // A04 · Virtualización y respaldos
  asset('VMW-VC01', 'vCenter', 'VMware vCenter Server', 'Administra los hosts de virtualización.', 'TI', null, 'ADC', 'A04', 40, 1, 5, { privilegiado: true }),
  asset('VMW-ESX01', 'Host de virtualización 1', 'VMware ESXi (servidor 2U)', 'Ejecuta las máquinas virtuales de TI.', 'TI', null, 'ADC', 'A04', 36, 2, 5),
  asset('VMW-ESX02', 'Host de virtualización 2', 'VMware ESXi (servidor 2U)', 'Ejecuta las máquinas virtuales de TI.', 'TI', null, 'ADC', 'A04', 34, 2, 5),
  asset('VMW-ESX03', 'Host de virtualización 3', 'VMware ESXi (servidor 2U)', 'Capacidad de reserva para recuperar servicios.', 'TI', null, 'ADC', 'A04', 32, 2, 4),
  asset('BKP-VBR01', 'Servidor de respaldos', 'Veeam Backup & Replication', 'Orquesta las copias de seguridad.', 'TI', 'TI-BKP', 'ADC', 'A04', 28, 1, 5, { privilegiado: true }),
  asset('BKP-REPO01', 'Repositorio inmutable', 'Repositorio Linux endurecido (copias inmutables)', 'Copias que no se pueden borrar ni cifrar durante su retención.', 'TI', 'TI-BKP', 'ADC', 'A04', 23, 4, 5),
  asset('BKP-LTO01', 'Librería de cintas', 'Librería de cintas LTO (copia fuera de línea)', 'Copia desconectada de la red (regla 3-2-1).', 'TI', 'TI-BKP', 'ADC', 'A04', 18, 3, 4),
  // B01 · SCADA y control (centro de control)
  asset('OT-FW01', 'Firewall TI/OT', 'Firewall industrial (DMZ entre TI y OT)', 'Única puerta entre la red corporativa y la red de control.', 'OT', 'OT-SCADA', 'ALP', 'B01', 40, 1, 5),
  asset('SCD-P01', 'SCADA · primario', 'Servidor SCADA de oleoductos (redundante)', 'Supervisa presiones, caudales y válvulas en tiempo real.', 'OT', 'OT-SCADA', 'ALP', 'B01', 37, 2, 5, { privilegiado: true }),
  asset('SCD-S01', 'SCADA · respaldo', 'Servidor SCADA de oleoductos (redundante)', 'Toma el control si falla el primario.', 'OT', 'OT-SCADA', 'ALP', 'B01', 34, 2, 5, { privilegiado: true }),
  asset('HIS-PI01', 'Historian', 'AVEVA PI Server (historian)', 'Historia de presiones y caudales de cada tramo.', 'OT', 'OT-SCADA', 'ALP', 'B01', 31, 2, 4),
  asset('LDS-01', 'Detección de fugas', 'Sistema de detección de fugas (modelo hidráulico en línea)', 'Compara caudales para detectar fugas.', 'OT', 'OT-SCADA', 'ALP', 'B01', 28, 1, 5),
  asset('HMI-01', 'Consola de operador 1', 'Estación HMI de operación', 'Pantallas de los operadores del centro de control.', 'OT', 'OT-SCADA', 'ALP', 'B01', 25, 1, 4),
  asset('HMI-02', 'Consola de operador 2', 'Estación HMI de operación', 'Pantallas de los operadores del centro de control.', 'OT', 'OT-SCADA', 'ALP', 'B01', 24, 1, 4),
  asset('ENG-WS01', 'Estación de ingeniería', 'Estación de programación de PLC/RTU', 'Modifica la lógica de control: acceso muy restringido.', 'OT', 'OT-SCADA', 'ALP', 'B01', 22, 1, 5, { privilegiado: true }),
  // B02 · Comunicaciones de campo y medición
  asset('FEP-01', 'Procesador de comunicaciones', 'Front-end processor DNP3/Modbus', 'Habla con las RTU de las estaciones de bombeo.', 'OT', 'OT-SCADA', 'ALP', 'B02', 40, 2, 5),
  asset('RTU-T1', 'Enlace de campo · Tramo 1', 'Router industrial + enlace MPLS/satelital', 'Comunicación con las estaciones Houston–Atlanta.', 'OT', 'OT-T1', 'ALP', 'B02', 36, 1, 5),
  asset('RTU-T2', 'Enlace de campo · Tramo 2', 'Router industrial + enlace MPLS/satelital', 'Comunicación con las estaciones Atlanta–Greensboro.', 'OT', 'OT-T2', 'ALP', 'B02', 35, 1, 5),
  asset('RTU-T3', 'Enlace de campo · Tramo 3', 'Router industrial + enlace MPLS/satelital', 'Comunicación con las estaciones Greensboro–Linden.', 'OT', 'OT-T3', 'ALP', 'B02', 34, 1, 5),
  asset('MED-01', 'Medición fiscal', 'Servidor de medición de transferencia de custodia', 'Volúmenes entregados a cada cliente: la facturación depende de estos datos.', 'OT', 'TI-FACT', 'ALP', 'B02', 31, 2, 5),
  asset('NTP-OT01', 'Reloj GPS', 'Servidor de tiempo GPS', 'Sincroniza la hora de SCADA y de la medición.', 'OT', null, 'ALP', 'B02', 29, 1, 3),
]);
