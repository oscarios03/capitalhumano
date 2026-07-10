# Handoff: Rediseño 1C — Capital Humano MX

## Overview
Rediseño visual de la plataforma **Capital Humano MX** (SaaS de RH/nómina para México).
Dirección elegida: **"1C · Corporativo · Rail Navy"** — barra lateral en tinta profunda (navy)
sobre un cuerpo claro, iconos de línea, títulos en serif corporativa y verde institucional
usado con moderación. El objetivo es alejarse del look "genérico de IA" (gradientes dorados,
glow saturado, emojis por todos lados) hacia algo pulido, minimalista y profesional.

## About the Design Files
Los archivos `.dc.html` de este paquete son **referencias de diseño creadas en HTML** —
prototipos que muestran el look & feel y el comportamiento buscado, **no código de producción
para copiar tal cual**. La tarea es **recrear este diseño en el entorno existente del proyecto**.

**Nota importante sobre este codebase:** la app NO usa framework — es **JavaScript vanilla que
construye HTML como strings** y una hoja de estilos central (`css/app.css`) basada en clases y
variables CSS. Por eso, la mayor parte del rediseño se logra **reescribiendo los design tokens
(`:root`) y los estilos de los componentes ya existentes** (`.topbar`, `.sidebar`, `.nav-item`,
`.kpi-card`, `.card`, `.data-table`, `.btn-primary`, `.login-*`, etc.), **sin tocar la lógica JS**.
La excepción son los **iconos**: hoy son emojis incrustados en los strings de JS y deben
reemplazarse por el sprite SVG incluido (ver sección Assets).

Incluyo un archivo `theme-1c.css` como **punto de partida concreto**: mapea las clases reales de
`app.css` a la nueva estética. Puedes fusionarlo dentro de `app.css` o cargarlo después.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciado e interacciones son finales.
Recrear pixel-perfect. Todos los hex, tamaños y pesos están documentados abajo.

---

## Design Tokens

### Color
| Token | Hex | Uso |
|---|---|---|
| Fondo página / contenido | `#eef1f4` | `body`, área `main` |
| Superficie sutil | `#f8fafb` | headers de tabla, hover de fila, zebra |
| Card / panel | `#ffffff` | tarjetas, tablas, topbar |
| **Sidebar (navy)** | `#0f2438` | barra lateral, tarjeta "Neto a pagar" |
| Borde | `#e2e6ea` | bordes de card, divisores |
| Borde fuerte | `#dbe1e7` | inputs, botones secundarios |
| Divisor interno | `#edf0f3` | filas de tabla, separadores dentro de card |
| Texto primario | `#14212e` | títulos, valores |
| Texto secundario | `#5b6672` | labels, subtítulos |
| Texto tenue | `#94a0ac` | metadatos, placeholders |
| **Acento (verde)** | `#15803d` | botón primario, nav activo, links |
| Acento hover | `#0f6630` | hover del botón primario |
| Acento suave (fondo) | `rgba(21,128,61,.08)` (`#15803d14`) | fondo de badge/botón sutil |
| Acento sobre navy | `#5cc286` | iconos activos y acentos dentro del sidebar |
| Barra nav activa | `#3fae6b` | indicador vertical de 3px en item activo |

**Colores del sidebar navy (texto sobre `#0f2438`):**
| Token | Hex | Uso |
|---|---|---|
| Nav idle (texto) | `#9db0c2` | items no activos |
| Nav idle (icono) | `#6f8399` | iconos no activos |
| Nav activo (fondo) | `rgba(255,255,255,.09)` | item activo |
| Nav activo (texto) | `#ffffff` | item activo |
| Nav hover (fondo) | `rgba(255,255,255,.06)` | hover |
| Label de sección | `#5d7186` | "PRINCIPAL", "GESTIÓN", etc. |

**Colores de estado / semánticos:**
| Estado | Texto | Fondo | Uso |
|---|---|---|---|
| Peligro / crítico | `#c0392b` | `#c0392b14` | falta, alerta crítica, "No" |
| Advertencia | `#d98a2b` / texto `#a9752a` | `#d98a2b18` | retardo, alerta media |
| Info / azul | `#2c6fb0` | `#4a90e216` | estado "Aprobado", contrato por obra |
| Éxito / verde | `#15803d` | `#15803d14` | activo, pagado, "Sí" |

**Badges de calidad de contrato** (borde = color con alpha `40`, pill `border-radius:20px`, `padding:3px 10px`, `white-space:nowrap`):
| Calidad | Texto | Fondo | Borde |
|---|---|---|---|
| De Planta | `#15803d` | `#15803d14` | `#15803d33` |
| A Prueba | `#a9752a` | `#e6a23c1f` | `#e6a23c40` |
| Por Obra | `#2c6fb0` | `#4a90e21c` | `#4a90e240` |
| Por Comisión | `#a03e4d` | `#c0567218` | `#c0567240` |

### Tipografía
- **Títulos / cifras destacadas:** `'Source Serif 4', Georgia, serif` — peso 600, `letter-spacing:-.015em` a `-.02em`.
- **Cuerpo / UI:** `'Public Sans', system-ui, sans-serif` — pesos 400/500/600/700.
- Import: `https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=Public+Sans:wght@400;500;600;700&display=swap`

Escala de texto usada:
| Uso | Tamaño | Peso | Familia |
|---|---|---|---|
| Título de página (H1) | 28px | 600 | serif |
| Cifra KPI | 32px | 600 | serif |
| Cifra monetaria KPI | 26px | 600 | serif |
| Título de card | 14px | 600 | sans |
| Fila de tabla | 13–13.5px | 500–600 | sans |
| Encabezado de tabla | 10.5px | 700, `uppercase`, `letter-spacing:.06em` | sans |
| Item de nav | 13px | 500 (600 activo) | sans |
| Label de sección nav | 10.5px | 700, `uppercase`, `letter-spacing:.1em` | sans |
| Subtítulo / meta | 11.5–13.5px | 400–500 | sans |

### Espaciado y forma
- Radios: inputs `8–9px`, botones/buscador `9–10px`, cards `13–14px`, pills `20px`/`100px`, avatar `50%`.
- Padding de card: `18px 20px` (KPI) a `20px 22px` (panel).
- Sidebar ancho: `240px`. Topbar alto: `60px`.
- Gap de grid de KPIs: `16px`. Gap de paneles: `18px`.
- Item de nav: `padding:9px 12px; margin:1px 12px; gap:11px; border-radius:9px`. Icono `17px`.
- **Sin sombras pesadas ni glow.** Sombra sólo en elementos flotantes (dropdown, modal): `0 8px 24px -8px rgba(20,33,46,.28)`.

---

## Screens / Views

### 1. Shell (topbar + sidebar) — se aplica a TODAS las vistas
**Layout:** grid `240px 1fr` × `60px 1fr`. Sidebar ocupa toda la altura (columna 1, filas 1→-1);
topbar en columna 2 fila 1; contenido con scroll en columna 2 fila 2 (`padding:30px 36px 60px`).

**Sidebar (navy `#0f2438`):**
- Cabecera de marca (alto 60px, borde inferior `rgba(255,255,255,.08)`): cuadro `32px` radio `8px`
  fondo `#15803d` con "C" en serif blanca + wordmark "Capital Humano" serif 16px blanco.
- Grupos con label de sección (`#5d7186`): **Principal** (Dashboard), **Gestión** (Trabajadores,
  Contratos, Asistencia, Reloj Checador, Nómina, Actas Admin., Bajas, IMSS / Movimientos),
  **Prestaciones** (Vacaciones, Incapacidades, Aguinaldo, PTU), **Organización** (Organigrama,
  Reportes), **Herramientas** (Agente IA — en verde `#5cc286`, Manual de Uso).
- Item activo: fondo `rgba(255,255,255,.09)`, texto blanco, barra vertical de `3px` `#3fae6b`
  pegada al borde izquierdo, icono `#5cc286`.

**Topbar (blanco):** buscador a la izquierda (fondo `#f1f4f7`, borde `#e2e6ea`, icono lupa +
placeholder "Buscar trabajador…"), spacer, campana, y bloque de usuario (avatar con iniciales en
serif, nombre + empresa, chevron). Separadores con `border-left:1px solid #e2e6ea`.

### 2. Dashboard
- Header de página: H1 serif "Panel de control" + subtítulo; botón primario verde "Nuevo trabajador"
  (con icono `+`).
- Fila de 4 KPIs (`grid repeat(4,1fr) gap:16px`): label (12.5px `#5b6672`) + cifra serif 32px + submeta 11.5px `#94a0ac`.
- Dos paneles (`grid 1.15fr 1fr gap:18px`): **Alertas legales** (título + pill "3 urgentes" en rojo,
  filas con punto de color por prioridad, texto + subtexto, chip de artículo a la derecha) y
  **Incidencias recientes** (mini-tabla Trabajador / Tipo / Just. con badges falta/retardo).

### 3. Trabajadores
- Header + botones "Importar" (secundario) y "Nuevo trabajador" (primario).
- Barra de filtros: buscador ancho + dropdowns "Centro de trabajo" y "Calidad".
- Tabla en card con sección colapsable "Activos · 48" (header `#f8fafb`). Columnas reales del sistema:
  **Trabajador** (avatar iniciales + nombre + RFC), **Calidad** (badge de contrato), **Puesto**,
  **Centro de trabajo**, **Ingreso** (fecha, `white-space:nowrap`), **Acciones** (botones-icono
  cuadrados `32px` con borde: ver `eye` / editar `pencil`).
- Hover de fila: fondo `#f8fafb`. Badges de calidad y fechas NO deben saltar de línea (`white-space:nowrap`).

### 4. Nómina
- Header + botón primario "Nuevo período".
- Tabs: **Períodos** (activo, underline verde), Detalle del período, Historial por trabajador.
- 4 KPIs: Período actual, Percepciones, Deducciones, y **Neto a pagar** en tarjeta **navy `#0f2438`**
  (texto blanco, submeta verde `#5cc286`) para destacarla.
- Tabla de períodos: columnas **Período, Tipo, Fechas, Trab. (der), Total neto (der), Estado, Acciones**.
  Estados como badges: **Borrador** (gris `#eef1f4`/`#dbe1e7`), **Aprobado** (azul), **Pagado** (verde).
  Acción "Ver detalle" (verde suave si es el período vigente, gris si histórico).

### 5. Login
- Split `1fr 1fr` a pantalla completa.
- **Izquierda navy `#0f2438`:** marca arriba, propuesta de valor al centro (kicker verde en mayúsculas
  + titular serif 38px blanco + párrafo `#9db0c2`), pie con badges "LFT 2026 · IMSS · INFONAVIT · ISR".
- **Derecha blanca:** formulario máx `380px` — H1 serif "Bienvenido de vuelta", tabs
  Iniciar sesión / Crear cuenta (segmented sobre `#f1f4f7`), campos Correo (icono mail) y Contraseña
  (icono lock) con label en mayúsculas, link "¿Olvidaste tu contraseña?", botón primario ancho
  "Entrar →" (icono flecha), nota legal al pie.

---

## Interactions & Behavior
- **Navegación:** sin cambios respecto al router por hash actual (`navigate('ruta')`). El item de nav
  correspondiente recibe el estado activo (fondo + barra verde). El prototipo usa un conmutador
  flotante sólo para demo; en producción se conserva el `hashchange` existente.
- **Hover:** items de nav → `rgba(255,255,255,.06)` + texto blanco; filas de tabla → `#f8fafb`;
  botón primario → `#0f6630`; botón secundario → `#f5f7f9`. Transición `~.18s ease`.
- **Estados de input (focus):** borde `#15803d` + `box-shadow:0 0 0 3px rgba(21,128,61,.12)`.
- **Sin animaciones nuevas.** Mantener `fadeInUp` existente para entrada de vistas si se desea.

## State Management
No requiere estado nuevo. El rediseño es puramente de presentación sobre la estructura y el estado
existentes (CTX, router por hash, `_N`, etc.). No se modifica ningún archivo de `js/`.

## Assets
- **Iconos:** `icons-sprite.svg` (incluido). Sprite SVG con `<symbol>` de estilo línea
  (`stroke=currentColor`, `stroke-width:1.6`, caps/joins redondeados). Reemplazan a los emojis del
  sidebar y de los KPIs. Mapeo emoji→símbolo:
  `📊 dashboard → #i-grid` · `👤 → #i-user` · `📄 → #i-file` · `🗓 → #i-calendar` · `⏱ → #i-clock` ·
  `💰 → #i-wallet` · `⚠️ → #i-alert` · `🚪 → #i-exit` · `🏛 → #i-bank` · `🏖 → #i-sun` ·
  `🏥 → #i-activity` · `🎄 → #i-gift` · `📊 PTU → #i-pie` · `🏗 → #i-network` · `📈 → #i-bar` ·
  `🏢 → #i-building` · `🤖 → #i-sparkle` · `📖 → #i-book` · buscar `#i-search` · campana `#i-bell` ·
  chevron `#i-chevron` · `#i-plus` · `#i-pencil` · `#i-eye` · `#i-download` · `#i-mail` · `#i-lock` · `#i-arrow`.
  Uso: incrustar el sprite una vez en `app.html`/`index.html` (o cargarlo) y referenciar con
  `<svg class="ic"><use href="#i-user"></use></svg>`. La marca "🏢" del brand se sustituye por el
  cuadro verde con la letra "C" en serif.
- **Fuentes:** Google Fonts (Source Serif 4 + Public Sans) — reemplazan a Montserrat + Inter.

## Files
- `Capital Humano 1C.dc.html` — prototipo navegable de la dirección 1C (Dashboard, Trabajadores, Nómina, Login). Referencia principal.
- `Rediseño Shell.dc.html` — comparativa de las 3 direcciones exploradas (1a/1b/1c) para contexto.
- `theme-1c.css` — punto de partida de implementación: tokens `:root` + estilos de componentes mapeados a las clases reales de `css/app.css`.
- `icons-sprite.svg` — sprite de iconos de línea.

Archivos del codebase a modificar (sólo presentación):
- `css/app.css` — reemplazar `:root` y estilos de `.topbar / .sidebar / .nav-item / .kpi-card / .card / .data-table / badges / .btn-* / forms / .login-*` según `theme-1c.css`.
- `app.html` e `index.html` — cambiar el `<link>` de fuentes; incrustar `icons-sprite.svg`.
- Strings de JS que emiten emojis (sidebar en `app.html`, `.kpi-icon`, etc.) — cambiar emoji por `<svg><use>`. No se toca la lógica.
