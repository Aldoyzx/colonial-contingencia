# Despliegue en la nube (Render)

Tiempo estimado: 15 minutos. Costo: gratis (plan Free de Render, sin tarjeta de crédito).
Resultado: el sistema queda accesible en `https://centro-contingencia-XXXX.onrender.com`.

## Por qué Render

| Necesidad del sistema | Cómo la cubre Render |
|---|---|
| Node.js 22 y PostgreSQL 16 | Ambos administrados; la base se crea desde el mismo archivo `render.yaml` |
| Infraestructura como código | El *Blueprint* `render.yaml` describe la base, el servicio y sus variables |
| HTTPS | Certificado TLS automático: las cookies de sesión viajan con `Secure` |
| Despliegue continuo | Cada `git push` a `main` vuelve a desplegar |
| Costo cero para la sustentación | Plan Free para el servicio web y para PostgreSQL |

Limitaciones del plan gratuito (documentación de Render):

- El servicio se **suspende tras 15 minutos sin tráfico**; el primer acceso tarda alrededor de un minuto. **Abran la URL 5 minutos antes de exponer.**
- El disco es **efímero**: por eso, en la nube las evidencias se guardan en PostgreSQL (`ALMACENAMIENTO=postgres`) y no en archivos.
- La base gratuita tiene 1 GB y **vence a los 30 días**. Despliéguenla dentro de ese plazo antes de la sustentación.

## Pasos

### 1. Subir el repositorio a GitHub

```bash
cd colonial-contingencia
git remote add origin https://github.com/<usuario>/colonial-contingencia.git
git push -u origin main
```

El repositorio puede ser privado; Render pide permiso para leerlo.

### 2. Crear el Blueprint en Render

1. Entrar a https://dashboard.render.com y registrarse con la cuenta de GitHub.
2. **New → Blueprint**.
3. Elegir el repositorio `colonial-contingencia` y la rama `main`.
4. Render lee `render.yaml` y muestra lo que va a crear: la base `contingencia-db` y el servicio `centro-contingencia`. Pulsar **Apply**.

### 3. Esperar el primer despliegue

- La base tarda 1–2 minutos y el servicio web unos 5 (instala dependencias y compila el cliente).
- En **Logs** deben aparecer estas líneas:

```
Esquema creado y datos iniciales cargados (con incidentes históricos de prueba).
API de contingencia escuchando en http://localhost:10000
Almacenamiento de evidencias: postgres
```

### 4. Verificar

| Prueba | Resultado esperado |
|---|---|
| `https://<url>/api/health` | `{"status":"ok","baseDeDatos":"ok","almacenamiento":"postgres"}` |
| Abrir `https://<url>` | Pantalla de acceso con las cuentas de demostración |
| Entrar como María Torres (`Colonial2021!`) | Panel con 10 servicios operativos |
| Analítica | Indicadores y gráficos con los 7 incidentes históricos |
| Cargar una imagen en un incidente | Aparece en la galería; "Verificar integridad" da ✔ |
| Mi cuenta → Activar MFA | QR que se escanea con Google o Microsoft Authenticator |

Para la evidencia de despliegue, tomen una captura con la URL `onrender.com` visible en la barra del navegador.

## Variables de entorno (ya definidas en `render.yaml`)

| Variable | Valor | Para qué |
|---|---|---|
| `NODE_ENV` | `production` | Cookies `Secure` y `APP_SECRET` obligatorio |
| `DATABASE_URL` | la entrega Render | Conexión interna a PostgreSQL |
| `APP_SECRET` | generado por Render (256 bits) | Firma de sesiones y cifrado de secretos MFA. **No cambiarlo**: cerraría las sesiones y anularía los MFA configurados |
| `ALMACENAMIENTO` | `postgres` | Evidencias en la base (disco efímero) |
| `CARGAR_DATOS_DEMO` | `true` | Carga los incidentes históricos al crear la base |
| `MOSTRAR_CUENTAS_DEMO` | `true` | Muestra las cuentas de prueba en el acceso. Ponerlo en `false` fuera de la sustentación |
| `MFA_OBLIGATORIO_ROLES` | vacío | Ej. `coordinador`: ese rol no puede operar sin MFA |

## Recomendación de seguridad para la sustentación

Las cuentas de demostración comparten la contraseña `Colonial2021!`, que figura en el repositorio. Después de desplegar:

1. Cambien la contraseña de cada cuenta en **Mi cuenta**, o
2. Pongan `MOSTRAR_CUENTAS_DEMO=false` y activen MFA al menos en la cuenta de la coordinadora.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El build falla en `vite: not found` | Falta `--include=dev` en el build del cliente; usen el `buildCommand` de `render.yaml` |
| `APP_SECRET es obligatorio` en los logs | La variable no se creó: agréguenla en Environment con un valor de 32 caracteres o más |
| La página tarda en abrir | El servicio estaba suspendido; esperen un minuto |
| Error de conexión a la base | Verifiquen que `DATABASE_URL` use la *Internal Database URL* |
| Las evidencias desaparecen tras reiniciar | `ALMACENAMIENTO` está en `local`; cámbienlo a `postgres` |

## Alternativa

El mismo proyecto funciona en Railway (servicio Node.js + PostgreSQL) con las mismas variables de entorno, el comando de compilación de `render.yaml` y `cd server && npm start` como comando de inicio.
