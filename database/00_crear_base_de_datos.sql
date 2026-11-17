-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  00 · Creación del rol de aplicación y de la base de datos
--  Gestor: PostgreSQL 16
--
--  Ejecutar UNA sola vez como superusuario (postgres), fuera de una transacción:
--     psql -U postgres -f database/00_crear_base_de_datos.sql
--  Con Docker no hace falta: docker-compose.yml ya crea el rol y la base.
-- =============================================================================

-- Rol propio para la aplicación (mínimo privilegio: no es superusuario).
-- Cambia la contraseña fuera del entorno académico.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'contingencia') THEN
    CREATE ROLE contingencia LOGIN PASSWORD 'contingencia';
  END IF;
END $$;

-- CREATE DATABASE no admite IF NOT EXISTS; \gexec la crea solo si falta.
SELECT 'CREATE DATABASE contingencia OWNER contingencia ENCODING ''UTF8'' TEMPLATE template0'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'contingencia')\gexec

-- Base separada para las pruebas automatizadas (npm test la vacía en cada prueba).
SELECT 'CREATE DATABASE contingencia_test OWNER contingencia ENCODING ''UTF8'' TEMPLATE template0'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'contingencia_test')\gexec

-- Siguiente paso:
--   psql -U contingencia -d contingencia -f database/01_esquema.sql
--   psql -U contingencia -d contingencia -f database/02_datos_iniciales.sql
