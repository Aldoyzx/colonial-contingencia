/**
 * Recursos tecnológicos que exige el plan de contingencia. Cada etapa de flow.js
 * referencia estos códigos en su propiedad `recursos`.
 */
export const RESOURCE_CATEGORY = Object.freeze({
  TOOL: 'herramienta',
  INFRA: 'infraestructura',
  EXTERNAL: 'servicio_externo',
  DOCUMENT: 'documento',
});

export const RESOURCES = Object.freeze([
  { codigo: 'R01', nombre: 'EDR / antivirus corporativo', categoria: RESOURCE_CATEGORY.TOOL, descripcion: 'Detección y respuesta en equipos; barridos para validar la erradicación.' },
  { codigo: 'R02', nombre: 'SIEM y registros centralizados', categoria: RESOURCE_CATEGORY.TOOL, descripcion: 'Correlación de alertas y evidencia de la actividad anómala.' },
  { codigo: 'R03', nombre: 'Firewall y segmentación TI/OT', categoria: RESOURCE_CATEGORY.INFRA, descripcion: 'Permite aislar la red operativa de la red corporativa.' },
  { codigo: 'R04', nombre: 'Respaldos offline inmutables', categoria: RESOURCE_CATEGORY.INFRA, descripcion: 'Copias fuera de línea verificadas para restaurar sin pagar rescate.' },
  { codigo: 'R05', nombre: 'Herramienta de descifrado', categoria: RESOURCE_CATEGORY.TOOL, descripcion: 'Descifrador obtenido tras el pago o de las autoridades; lento, se usa como apoyo.' },
  { codigo: 'R06', nombre: 'Kit forense (disco y memoria)', categoria: RESOURCE_CATEGORY.TOOL, descripcion: 'Imágenes forenses para hallar persistencia y preservar evidencia.' },
  { codigo: 'R07', nombre: 'Gestión de identidades con MFA', categoria: RESOURCE_CATEGORY.INFRA, descripcion: 'Rotación de credenciales y segundo factor obligatorio en la VPN.' },
  { codigo: 'R08', nombre: 'Canal de comunicación fuera de banda', categoria: RESOURCE_CATEGORY.INFRA, descripcion: 'Teléfonos y chat alterno por si el correo corporativo está comprometido.' },
  { codigo: 'R09', nombre: 'Contactos de FBI, CISA y Dpto. de Energía', categoria: RESOURCE_CATEGORY.EXTERNAL, descripcion: 'Notificación obligatoria y apoyo de las autoridades.' },
  { codigo: 'R10', nombre: 'Proveedor de respuesta a incidentes', categoria: RESOURCE_CATEGORY.EXTERNAL, descripcion: 'Equipo especializado externo (en el caso real, Mandiant).' },
  { codigo: 'R11', nombre: 'Asesoría legal y seguro cibernético', categoria: RESOURCE_CATEGORY.EXTERNAL, descripcion: 'Evalúa el pago del rescate, obligaciones regulatorias y cobertura.' },
  { codigo: 'R12', nombre: 'Flota de camiones y acuerdos logísticos', categoria: RESOURCE_CATEGORY.EXTERNAL, descripcion: 'Ruta alternativa de suministro mientras el oleoducto está detenido.' },
  { codigo: 'R13', nombre: 'Procedimientos de operación manual (SCADA)', categoria: RESOURCE_CATEGORY.DOCUMENT, descripcion: 'Guía para reiniciar cada tramo de forma manual y segura.' },
  { codigo: 'R14', nombre: 'Centro de Contingencia (este sistema)', categoria: RESOURCE_CATEGORY.TOOL, descripcion: 'Registro del incidente, decisiones, acciones y estado de servicios.' },
  { codigo: 'R15', nombre: 'Plantillas de comunicación pública', categoria: RESOURCE_CATEGORY.DOCUMENT, descripcion: 'Comunicados preaprobados para clientes, prensa y gobierno.' },
]);
