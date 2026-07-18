# Estado del plan de mejoras — Capital Humano MX

> **Última actualización:** 16 de julio de 2026
> **Rama:** `claude/hr-platform-mexico-review-7c46e2`
> **Plan completo:** `C:\Users\oscar\.claude\plans\attach-velvety-meteor.md`
> **Proyecto Supabase:** KAPITAL HUMANO (`xqbzxkujooarntawzsoc`)

Este documento es el punto de retomada. Resume de dónde salió el plan, qué ya
quedó hecho, qué bugs aparecieron en el camino y qué falta.

---

## 1. De dónde salió esto

Se hizo una revisión de producto completa de la plataforma, recorriéndola como
si fuéramos el dueño de una pyme y el encargado de RH de una empresa grande. De
ahí salió un diagnóstico y el usuario seleccionó 13 mejoras, organizadas en 11
fases.

**Conclusión de la revisión:** la profundidad legal-operativa ya es superior a
la de muchos competidores (actas con IA, bajas con documentos listos para firma,
resguardos, alertas preventivas). Lo que falta para ser *la mejor plataforma de
RH de México* es cerrar el ciclo fiscal (timbrado), abrirle la puerta al
empleado (portal/autoservicio) y hablar el idioma del contador.

**Quedó explícitamente FUERA de este plan** (son las apuestas grandes, para
después): CFDI/timbrado de nómina, portal del empleado, firma NOM-151,
NOM-035, DC-3, REPSE y checada con GPS.

### Decisiones que ya tomó el usuario (no volver a preguntar)

| Tema | Decisión |
|---|---|
| WhatsApp | Enlaces `wa.me` con mensaje prellenado. **Sin envío automático ni PDF adjunto** — el usuario decide y adjunta a mano. |
| Roles | Enforcement real en **RLS + gating de UI**. |
| Vacaciones | **RH captura, gerente/admin aprueba** (sin acceso de empleados). |
| Ajuste anual ISR | **Cálculo + aplicación** en la nómina de diciembre. |

---

## 2. Lo que ya está hecho (5 fases, 5 commits)

| Commit | Fase |
|---|---|
| `055c894` | Fase 1 — Motor fiscal patronal (migración 32) |
| `3126081` | Fase 2 — Roles y permisos RLS + UI (migración 33) |
| `367d61d` | Fase 3 — Dashboard: costo de nómina y obligaciones |
| `a0e3a53` | Fase 4 — Trabajadores: validaciones, expediente, kit de defensa (migración 34) |
| `4c52d77` | Fase 5 — Asistencia: vista del mes y retardo automático |

*(La Fase 11 — simulador de despido — entró dentro del commit de la Fase 1.)*

### Migraciones aplicadas en producción ✅

**32, 33 y 34 ya están aplicadas y verificadas** en `xqbzxkujooarntawzsoc`.
No hay que volver a aplicarlas.

- **32** — `prima_riesgo_pct`, `entidad_federativa`, `isn_pct` en `empresas`;
  `imss_patronal`, `infonavit_patronal`, `isn`, `subsidio_empleo`,
  `ajuste_anual_isr` en `recibos_nomina`; subsidio al empleo 2026 en
  `config_valores`.
- **33** — roles, helpers, `admin_set_rol()`, `listar_usuarios_empresa()`,
  tabla `invitaciones`, políticas RLS por rol en 24 tablas.
- **34** — `fecha_nacimiento`, `sexo`, `telefono`, `metodo_pago`,
  `monto_efectivo` en `trabajadores`; ampliación de `tipo_documento_enum`.

### Archivos nuevos

```
app/js/validaciones_mx.js   RFC/CURP/NSS con dígito verificador + semáforo de expediente
app/js/roles.js             Gating de UI por rol + pantalla de usuarios e invitaciones
app/js/obligaciones.js      Calendario de obligaciones patronales
app/js/ajuste_anual.js      Ajuste anual de ISR (Art. 97 LISR)
app/js/kit_defensa.js       ZIP probatorio por trabajador
app/migrations/32_migration_fiscal_patronal.sql
app/migrations/33_migration_roles.sql
app/migrations/34_migration_trabajadores_v4.sql
docs/casos-prueba-fiscal.md 26 casos verificables del motor fiscal
```

---

## 3. 🔴 Bugs preexistentes encontrados y corregidos

No estaban en el plan: aparecieron al trabajar encima. **Varios eran graves.**

| # | Bug | Impacto | Dónde |
|---|---|---|---|
| 1 | `ISR_MENSUAL_2026` traía la tarifa **anterior** al Anexo 8 de la RMF 2026 (primer renglón hasta $746.04 en vez de $844.59) | **Se retenía ISR de más a todos los trabajadores.** El SAT la actualizó por la inflación acumulada de 13.21% (>10%, Art. 152 LISR) | `nomina.js` |
| 2 | `usuario_empresas` tenía `FOR ALL USING (usuario_id = auth.uid())` **sin `WITH CHECK`**. Postgres reutiliza el `USING` para el INSERT | **Cualquier usuario podía vincularse a CUALQUIER empresa** conociendo su UUID y entrar con `set_empresa_activa()` a leer y escribir todos sus datos. Rompía el aislamiento multiempresa | migración 33 |
| 3 | `_generarPeriodoAguinaldo` insertaba en 5 columnas inexistentes (`sueldo_base`, `percepciones_totales`, `deducciones_totales`, `salario_diario`, `estado`) | **El botón de generar aguinaldo fallaba siempre** | `aguinaldo.js` |
| 4 | `calcularPTU` leía `sueldo_base`/`percepciones_totales` (inexistentes) | La masa salarial quedaba en 0 → **el 50% de la PTU correspondiente a salarios se repartía mal** | `ptu.js` |
| 5 | `expediente.js` ofrecía el tipo `resguardo`, ausente del `tipo_documento_enum` | **Subir una carta responsiva firmada fallaba siempre** | migración 34 |
| 6 | `db.getKPIs()` contaba TODOS los registros de asistencia del mes | El KPI **"Faltas este mes" mostraba el total de capturas**, no las faltas | `db.js` |
| 7 | `FESTIVOS_2026` hardcodeado, duplicando la tabla `dias_festivos` | **En 2027 el módulo habría dejado de marcar festivos**, en silencio | `asistencia.js` |
| 8 | `handle_new_user`, `setup_empresa`, `get_or_create_matriz` ejecutables por `anon` vía RPC | Postgres otorga `EXECUTE` a `PUBLIC` por default; revocar solo de `anon` no basta | migración 33 |
| 9 | Un admin no podía ver los perfiles de su empresa (`USING id = auth.uid()`) | Imposible administrar usuarios | migración 33 |
| 10 | `aprobarVAC`/`rechazarVAC` ignoraban el `.error` de supabase-js | Un rechazo de RLS **fallaba en silencio**: el botón no hacía nada | `vacaciones.js` |
| 11 | `switchAsistTab` marcaba la pestaña activa por índice | Se rompía al insertar una pestaña en medio | `asistencia.js` |

---

## 4. Decisiones de diseño que conviene conocer

Cosas que se resolvieron de cierta forma **a propósito**. Si se cambian sin
saber por qué, se rompe algo.

- **Los helpers de rol son `SECURITY DEFINER` a propósito.** Una política sobre
  `perfiles` que leyera `perfiles` sin saltarse RLS provocaría recursión
  infinita. En las políticas van envueltos en `(SELECT public.x())` para que
  Postgres los evalúe una vez por consulta (InitPlan), no una por fila.
- **Patrón de compuerta con `set_config`.** El trigger
  `zz_perfiles_bloquear_cambio` impide cambiar `rol`/`sucursal_id`/`empresa_id`
  directamente; la función autorizada (`admin_set_rol`, `set_empresa_activa`)
  activa `app.allow_rol_change` / `app.allow_empresa_change` y el trigger la
  respeta. **Nadie cambia su propio rol, ni un admin** — eso es lo que impide la
  auto-promoción. Hay guardia de último admin.
- **En el semáforo de expediente los documentos pesan más que los datos.** Un
  expediente con TODOS los datos y cero documentos da **46%, no 61%**: en juicio
  el documento firmado es la prueba y lo capturado en el sistema es solo tu
  dicho (Art. 784 LFT). El contrato firmado vale por tres campos.
- **El retardo manual replica exactamente la regla de `registrar_checada()`**
  (migración 15): retardo si entrada > `hora_inicio` + tolerancia, minutos
  contados desde `hora_inicio`. Si las dos vías clasificaran distinto, el mismo
  trabajador tendría retardo o no según cómo se registró — y eso se cae en juicio.
- **Las fechas fiscales se recorren a día hábil; las laborales no.** El aguinaldo
  (20-dic) y la PTU no se empujan: la ley dice pagar *antes* del límite.
- **La fecha límite de la PTU se deduce del RFC**: 12 caracteres = persona moral
  (30-may), 13 = física (29-jun).
- **"Vencida" y "por vencer" se cuentan por separado** en obligaciones. Mezclarlas
  haría creer que algo da tiempo cuando ya se pasó.
- **Las validaciones de RFC/CURP/NSS avisan, no bloquean**: hay expedientes
  heredados imperfectos. Los RFC genéricos (`XAXX010101000`) se aceptan aparte
  porque no cumplen el dígito verificador.

### ⚠️ Trampa de supersede — `handle_new_user()`

Está definida en las migraciones **00, 21 y 33**; la canónica es la **33**.
La **21 (planes) NO está aplicada** en producción. La versión de la 33 incluye
el alta de suscripción de prueba de la 21, condicionada a
`to_regclass('public.suscripciones') IS NOT NULL`, para funcionar con o sin ella.

> **Si algún día se aplica la 21 por separado, hay que volver a correr la 33**,
> o los usuarios invitados dejarán de entrar a la empresa que los invitó.

---

## 5. Lo que falta

### Fase 6 — Nómina (migración 35) — *siguiente en el plan*

- **6.1 Layouts bancarios** — `js/layouts_bancarios.js` con BBVA, Banorte y
  Santander + el CSV genérico actual. Selector de banco en `exportarSPEI()`.
  Migración 35: `empresas.banco_dispersion`, `empresas.cuenta_cargo`.
  ⚠️ **Bloqueador conocido:** los formatos de dispersión son especificaciones
  propietarias de cada banco y **no se tienen con certeza**. Ver la pregunta
  abierta abajo.
- **6.2 Paquete para el contador** — ZIP mensual desde Reportes: XLSX por
  período + acumulado + cuotas patronales/provisiones + CSV SUA.
- **6.3 Caja de ahorro y préstamos de caja** — ampliar el CHECK de
  `descuentos_trabajador.tipo` con `caja_ahorro` y `prestamo_caja`; UI en
  `descuentos.js`. La nómina ya aplica descuentos genéricos con prioridad legal:
  no requiere tocar el motor. Vista de saldo acumulado.
- **6.4 Pago mixto efectivo/transferencia** — ya existen `metodo_pago` y
  `monto_efectivo` (migración 34). El layout bancario dispersa solo la parte de
  transferencia; falta el listado imprimible "Nómina en efectivo" con línea de
  firma (reusar `pdfHeader`/`pdfSignatures` de `pdfs.js`).

### Fase 7 — Vacaciones — *ya no necesita migración*

- **7.1 Prima vacacional al gozar** — en `generarNominaPeriodo`, consultar
  `vacaciones` aprobadas tipo `vacacion` que traslapen el período → percepción
  `prima_vacacional = díasVac × salarioDiario × primaVacPct` (de
  `prestacionesEmpresa()`). Mostrarla en el recibo PDF y en la edición inline.
  ✅ **La columna `recibos_nomina.prima_vacacional` ya existe** (migración 05,
  verificado) — la migración 36 que preveía el plan **no hace falta**.
- **7.2 Constancia de vacaciones (Art. 81 LFT)** — PDF por solicitud aprobada
  con antigüedad, días que corresponden, gozados, saldo y firmas.
- **7.3 Aprobación por rol** — ✅ **ya hecho en la Fase 2** (política RLS de
  UPDATE + botones ocultos + `_errorVAC`).

### Fase 8 — IMSS: variabilidad bimestral del SBC

Sección nueva en `imss.js`. Por trabajador con percepciones variables (horas
extra, primas, comisiones, premios — de `recibos_nomina` del bimestre anterior):
nuevo SBC = fijo (`calcularFactorIntegracion`) + variables/días cotizados.
Genera `movimientos_imss` tipo `modificacion_salario` solo para quienes cambian
(reusar `registrarMovimientoIMSS` y `recalcularSBC`) y exporta el lote IDSE con
`_exportarLoteIMSS`. La obligación **ya aparece en el calendario del dashboard**
(Fase 3); falta la alerta en los primeros 5 días del mes impar.

### Fase 9 — Reportes gerenciales

Cuatro tipos nuevos en `reportes.js`, con el patrón shell + XLSX que ya existe
(`_exportarNominaXLSX`): **rotación** (altas/bajas por mes y motivo),
**ausentismo por sucursal**, **costo laboral por departamento** (usando el costo
patronal de la Fase 1) y **antigüedades** (con próximos aniversarios y prima de
antigüedad potencial).

### Fase 10 — WhatsApp (wa.me)

- El campo **Teléfono (WhatsApp)** del trabajador ✅ **ya existe** (Fase 4:
  columna `telefono` + campo en el tab Contactos).
- Falta `js/whatsapp.js` con `buildWaLink(tel, mensaje)` — normalizar a
  `52XXXXXXXXXX`, `encodeURIComponent` del mensaje.
- Falta poner los botones "📱 WhatsApp" (solo si hay teléfono) que **abren el
  chat con texto prellenado — nunca envían solos ni adjuntan PDF**: recibo listo
  (detalle del período), vacaciones aprobadas, contrato listo para firma, y
  citatorio de acta.

---

## 6. Preguntas abiertas para el usuario

1. **Layouts bancarios (Fase 6.1)** — Son formatos propietarios de cada banco y
   no se tienen con certeza. Se puede construir toda la arquitectura (selector,
   generador por formato, el genérico actual) y dejar los formatos marcados como
   "verificar contra el manual de tu banco", pero **no conviene inventar un
   layout** y que el portal lo rechace. Opciones: (a) construir la arquitectura
   con esa advertencia; (b) esperar a tener los manuales; (c) saltar a la Fase 8
   y volver después. **Sin resolver.**

2. **Prima de riesgo e ISN reales** — La empresa quedó con los valores por
   defecto: prima de riesgo **0.54355%** (clase I mínima) e **ISN 3%**. Hay que
   capturar los reales en *Mi Empresa → Configuración de Nómina* (la prima es la
   de la declaración de febrero ante el IMSS; el ISN depende del estado).

3. **La tarifa de ISR corregida cambia los netos.** Si hay nóminas generadas con
   la tabla anterior, al regenerarlas los trabajadores saldrán con menos
   retención. Conviene revisarlo con el contador antes de regenerar períodos ya
   pagados.

---

## 7. Cómo se ha estado verificando

Sin framework de pruebas: **harness de Node con `vm`** que carga los `.js` del
proyecto con stubs de `CTX`, `document` y `getConfigValor`. Las funciones son
puras, así que no requieren navegador ni sesión.

```js
const ctx = { console, window:{}, document:{getElementById:()=>null},
              CTX:{ empresa:{...} }, getConfigValor:(k,fb)=>({...})[k] ?? fb };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/js/calculo.js','utf8'), ctx);
// ojo: las variables `let` del top-level NO quedan en ctx;
// para tocarlas hay que hacer vm.runInContext('_A.x = ...', ctx)
```

**Casos verificados hasta ahora: 91.**

| Bloque | Casos | Vectores oficiales usados |
|---|---|---|
| Motor fiscal | 26 | `docs/casos-prueba-fiscal.md` |
| Identificadores MX | 25 | RFC `GODE561231GR8`, CURP `HEGG560427MVZRRL04`, NSS `92988084494` |
| Semáforo de expediente | 12 | — |
| Obligaciones (fechas) | 13 | — |
| Retardo | 16 | Paridad con `registrar_checada()` |

**RLS se probó distinto:** simulando el JWT de cada rol contra la base real,
dentro de transacciones que se revierten con un `RAISE EXCEPTION` final (16
pruebas). Después se confirmó que no quedó basura y que el rol del dueño seguía
intacto.

**Lección recurrente:** varias veces falló la *expectativa de la prueba*, no el
código. Pero en dos casos la prueba tenía razón y el código estaba mal
(los pesos del semáforo; el badge de "por vencer" con obligaciones vencidas).
Vale la pena distinguirlo cada vez en vez de ajustar el test a ciegas.

Además de las pruebas, **renderizar el HTML con el CSS real en el navegador**
encontró cosas que las pruebas no ven (el badge de obligaciones, los patrones de
la matriz). El servidor estático ya está configurado en `.claude/launch.json`
(`preview_start` con `name: "static"`). Nota: `app/app.html` redirige al login
sin sesión de Supabase, así que para ver componentes sueltos conviene generar un
HTML de vista previa temporal y borrarlo después.

---

## 8. Convenciones del repo (respetarlas)

- Vanilla JS sin build. Módulo nuevo = `<script src="js/X.js?v=1">` en
  `app/app.html`. **Subir el `?v=` al modificar** un archivo ya listado.
- Migraciones SQL numeradas e **idempotentes** en `app/migrations/`.
  **Siguiente número libre: 35.** Actualizar `app/migrations/README.md`.
- **Degradación elegante:** si una migración no está aplicada, `console.warn` y
  fallback (ver el patrón de reintentos en `generarNominaPeriodo`).
- Valores legales vigentes vía `getConfigValor()` con respaldo local.
- Cada fase actualiza su sección del manual (`renderManual` en `app.js`).
- **supabase-js NO lanza excepciones**: siempre revisar `.error`.
- Las Edge Functions del checador usan `service_role` (ignora RLS) y
  `registrar_checada()` es `SECURITY DEFINER`: el kiosco no se ve afectado por
  cambios de políticas.
