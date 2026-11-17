const USERS = [
  { nombre: 'María Torres', email: 'mtorres@colonial.local', rol: 'coordinador' },
  { nombre: 'Javier Ríos', email: 'jrios@colonial.local', rol: 'analista_ti' },
  { nombre: 'Lucía Paredes', email: 'lparedes@colonial.local', rol: 'operador_ot' },
  { nombre: 'Andrés Salinas', email: 'asalinas@colonial.local', rol: 'legal' },
  { nombre: 'Carla Méndez', email: 'cmendez@colonial.local', rol: 'comunicaciones' },
];

const SERVICES = [
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
];

/** Inserta usuarios y servicios solo si las tablas están vacías (idempotente). */
export function seedDatabase(db) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
  if (total > 0) return;

  const insertUser = db.prepare(
    'INSERT INTO usuarios (nombre, email, rol) VALUES (@nombre, @email, @rol)'
  );
  const insertService = db.prepare(
    `INSERT INTO servicios (codigo, nombre, tipo, criticidad, descripcion)
     VALUES (@codigo, @nombre, @tipo, @criticidad, @descripcion)`
  );

  db.transaction(() => {
    USERS.forEach((user) => insertUser.run(user));
    SERVICES.forEach((service) => insertService.run(service));
  })();
}
