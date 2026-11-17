# Panel de estado de servicios — especificación para Figma

Reto adicional del caso Colonial Pipeline: un panel que muestre qué servicios están
**operativos**, **afectados** o **en recuperación**. El prototipo web ya implementa este
panel (vista "Panel de servicios"); este documento sirve para reproducirlo en Figma con
las mismas medidas, colores y componentes, de modo que diseño y prototipo coincidan.

## 1. Frames a crear

| Frame | Tamaño | Qué muestra |
|---|---|---|
| `Panel / Normal` | 1440 × 1024 | 10 servicios operativos, sin incidentes, disponibilidad 100 % |
| `Panel / Crisis` | 1440 × 1024 | Tras D1 = Sí: 4 servicios OT y 3 TI afectados, 1 incidente abierto, disponibilidad 30 % |
| `Panel / Recuperación` | 1440 × 1024 | Tras D3 = Sí: servicios en recuperación (ámbar), algunos ya operativos |
| `Panel / Móvil` | 390 × 844 | Versión en una columna (KPIs 2 × 2) |

Los tres primeros frames cuentan la historia del incidente en la exposición.

## 2. Estilos de color (Local styles → Color)

| Estilo | Hex | Uso |
|---|---|---|
| `Brand/Navy` | `#1E3354` | Barra superior, títulos, botón primario |
| `Brand/Navy soft` | `#2C4570` | Hover y pestaña activa |
| `Brand/Amber` | `#F4C150` | Decisiones (igual que los rombos del diagrama) |
| `Surface/Background` | `#F4F6F9` | Fondo de página |
| `Surface/Card` | `#FFFFFF` | Tarjetas y paneles |
| `Surface/Border` | `#DDE3EC` | Bordes de 1 px |
| `Text/Primary` | `#1B2433` | Texto principal |
| `Text/Muted` | `#637087` | Texto secundario |
| `Status/Operativo` | `#2F8A57` sobre `#E7F4EC` | Servicio operativo |
| `Status/Afectado` | `#C93C3C` sobre `#FDECEC` | Servicio afectado |
| `Status/Recuperación` | `#B7791F` sobre `#FDF4DC` | Servicio en recuperación |

Los tres colores de estado coinciden con la leyenda del diagrama de flujo (rojo =
incidente, verde = recuperación, ámbar = decisión). El estado no depende solo del color:
cada badge lleva su texto, para que el panel sea accesible.

## 3. Estilos de texto (fuente Inter)

| Estilo | Tamaño / peso | Uso |
|---|---|---|
| `H1` | 22 / Bold | Título de página |
| `H3` | 15 / Bold | Título de panel |
| `KPI value` | 30 / Bold, números tabulares | Cifras del resumen |
| `Label caps` | 12 / Medium, mayúsculas, +4 % de tracking | Etiqueta del KPI |
| `Body` | 14 / Regular | Texto general |
| `Small` | 12 / Regular | Notas, fechas |
| `Badge` | 11 / SemiBold | Badges de estado |

## 4. Componentes (con variantes)

**`Badge/Estado`**: variante `estado = operativo | afectado | en_recuperacion`.
Auto layout horizontal con padding de 2 × 8, radio 999 y gap de 4: un punto de 6 px
y el texto.

**`ServiceCard`**: variante `estado`. Auto layout vertical, padding de 12 y gap de 4,
radio 8, borde de 1 px y **borde izquierdo de 4 px** con el color del estado. Contenido:
- Fila superior: código (`OT-T1`, 11 / Bold / Muted) y `Badge/Estado` a la derecha.
- Nombre del servicio (14 / SemiBold / Navy).
- Nota de estado (12 / Muted), por ejemplo "Detenido preventivamente (aislamiento TI/OT)".
- Pie: 5 puntos de criticidad (7 px, Navy los activos) y la fecha.
- Selector "Cambiar estado…" (solo lo ven los roles con permiso).

**`KPI`**: variante `tipo = operativo | afectado | recuperacion | disponibilidad`.
Tarjeta con borde superior de 4 px en el color del tipo; contiene la etiqueta, el valor y
el subtexto. La variante de disponibilidad añade una barra de 6 px de alto.

**`IncidentMini`**: fondo `Status/Afectado` claro; contiene el código, el badge de
severidad, el título y la etapa actual.

**`EventItem`**: un punto de 10 px sobre una línea vertical de 2 px, con el título, el
detalle y la fecha. El color del punto depende del evento: ámbar para decisiones, rojo
para detenciones y escalamientos, verde para restablecimientos.

## 5. Layout del frame de escritorio

```
┌──────────────────────────── Topbar (Navy, alto 64) ─────────────────────────────┐
│ Logo + "Centro de Contingencia"   Panel · Incidentes · Registrar    [Usuario ▾] │
└──────────────────────────────────────────────────────────────────────────────────┘
  Contenido: ancho máx. 1320, padding 24, gap 16
  ┌ Título "Estado de servicios" + "Actualización automática…" ──── [Actualizar] ┐
  ┌ KPI Operativos ┐┌ KPI Afectados ┐┌ KPI En recuperación ┐┌ KPI Disponibilidad ┐  (4 columnas)
  ┌──────────── Columna principal (fluida) ───────────┐ ┌─ Lateral 340 ──────────┐
  │ Panel "Red operativa (OT)"                         │ │ Incidentes abiertos    │
  │   grilla de ServiceCard (mín. 220, auto-fill)      │ │   IncidentMini…        │
  │ Panel "Sistemas de TI"                             │ │ Últimos eventos        │
  │   grilla de ServiceCard                            │ │   EventItem…           │
  └────────────────────────────────────────────────────┘ └────────────────────────┘
```

Usa auto layout en todo para que las tarjetas se reacomoden. En el frame móvil, la
columna lateral pasa debajo de la principal.

## 6. Datos para llenar los frames

Tramos OT: `OT-T1` Houston–Atlanta, `OT-T2` Atlanta–Greensboro, `OT-T3` Greensboro–Linden,
`OT-SCADA` Control de bombeo. Sistemas TI: `TI-FACT` Facturación, `TI-ERP` ERP, `TI-VPN`
VPN (vector de entrada), `TI-AD` Directorio activo, `TI-MAIL` Correo, `TI-BKP` Respaldos.

## 7. Atajo: importar el prototipo a Figma

Con el prototipo corriendo, puedes capturar las pantallas reales y usarlas como base:
- Toma una captura de cada estado (normal, crisis y recuperación) y redibuja encima con los
  componentes de este documento.
- También puedes usar un plugin de importación de HTML a Figma (por ejemplo, html.to.design
  con su extensión de navegador, que también funciona con `localhost`). La importación sale
  en capas editables, pero conviene limpiarla y convertirla en componentes.
