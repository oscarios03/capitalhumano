# Auditoría de seguridad y cumplimiento — Capital Humano MX

**Fecha:** 26 de julio de 2026
**Alcance:** frontend (`app/`), Edge Functions (`supabase/functions/`), esquema y RLS de
Postgres, Storage, hosting y documentos legales.
**Método:** revisión de código + **verificación en vivo** contra el proyecto Supabase de
producción `xqbzxkujooarntawzsoc` (consultas de solo lectura al catálogo) + pruebas
ejecutadas en navegador real contra el árbol de trabajo.

> Esta auditoría es **posterior** a la del 10/11-jul-2026 (47 hallazgos, cerrados). No
> reabre nada de aquella: se verificó hallazgo por hallazgo que las correcciones siguen
> vigentes en producción. Lo que sigue es material nuevo.

---

## 1. Resumen ejecutivo

**Semáforo general: 🟡 AMARILLO — no lanzar todavía, pero no por seguridad.**

La capa de aislamiento multi-tenant —lo que más importa en un producto que guarda CURP,
NSS, salarios e incapacidades de trabajadores ajenos— **está sólida**. Las 34 tablas tienen
RLS activa, todas las políticas filtran por empresa, las 18 funciones `SECURITY DEFINER`
tienen `search_path` fijo y ninguna es ejecutable por `anon`, y los dos buckets de Storage
son privados y están aislados por carpeta de empresa.

Lo que bloquea el lanzamiento es **el cobro y el sistema de planes, que no existen en
producción**, más las obligaciones de protección de datos que faltaban.

### Las 5 cosas más urgentes

| # | Qué | Severidad | Estado |
|---|-----|-----------|--------|
| 1 | **La migración 21 (planes/suscripciones) nunca se aplicó.** No existen `planes`, `suscripciones` ni `stripe_eventos`. En cascada: el Agente IA devuelve 403 siempre, el webhook de Stripe falla con 500 y Stripe lo reintenta para siempre, y no hay ningún límite de plan aplicado en servidor. | 🔴 CRÍTICA | **Pendiente — decisión tuya** |
| 2 | **`webhook-stripe` nunca activa la suscripción.** El paso que debía marcar la empresa como pagada es un `TODO`. Tampoco existe la Edge Function `crear-checkout-suscripcion`. El cobro no está conectado de punta a punta. | 🔴 CRÍTICA | **Pendiente — decisión tuya** |
| 3 | **XSS por atributo `onclick`**: un nombre de trabajador, empresa, sucursal o periodo con comilla doble inyectaba HTML ejecutable. Verificado explotable en navegador. | 🔴 CRÍTICA | ✅ Corregido |
| 4 | **Tracking sin consentimiento y sin aceptación registrada.** gtag y Meta Pixel cargaban en la primera visita; el registro no exigía aceptar nada ni dejaba constancia. | 🟠 ALTA | ✅ Corregido |
| 5 | **CDNs sin SRI y con versión flotante** (`@supabase/supabase-js@2`). Un compromiso del paquete ejecutaba código arbitrario en la sesión de RH. | 🟠 ALTA | ✅ Corregido |

---

## 2. Tabla de hallazgos

Ordenada por severidad. `archivo:línea` corresponde al estado **previo** a la corrección.

### 🔴 Críticas

| ID | Fase | Ubicación | Descripción | Estado |
|----|------|-----------|-------------|--------|
| **C-1** | 0/10 | producción (esquema) | La migración `21_migration_planes.sql` nunca se aplicó. `planes`, `suscripciones` y `stripe_eventos` no existen. Consecuencias verificadas: `agente-ia` llama `rpc('get_plan_actual')` → error → **403 permanente**; `webhook-stripe` inserta en `stripe_eventos` → error → **500 → reintentos infinitos de Stripe**; cero enforcement de límite de trabajadores o de features premium en servidor. | ⚠️ **Requiere decisión** |
| **C-2** | 10 | `supabase/functions/webhook-stripe/index.ts:157-170` | El paso 3 (activar la suscripción) es un comentario `TODO`. Un pago exitoso de Stripe no cambia nada en la base. No existe `crear-checkout-suscripcion`. | ⚠️ **Requiere decisión** |
| **C-3** | 6 (A03) | `app.js:1374`, `checador.js:93,116`, `nomina.js:287` | Patrón `onclick="fn('${valor}')"` escapando **solo** la comilla simple. Un nombre con `"` cierra el atributo e inyecta handlers. **Verificado explotable**: el nombre `Aceros" onmouseover="alert(1)" x="` producía un botón con 3 atributos, uno de ellos un handler activo. | ✅ Corregido |

### 🟠 Altas

| ID | Fase | Ubicación | Descripción | Estado |
|----|------|-----------|-------------|--------|
| **A-1** | 9 | `index.html`, `tracking.js`, 4 landings, `pago-exitoso.html` | `initTracking()` se llamaba sin condición: gtag, Meta Pixel y el pixel de conversión de DoubleClick cargaban en la primera visita, antes de cualquier consentimiento. | ✅ Corregido |
| **A-2** | 9 | `index.html` (registro) | No había casilla de aceptación del Aviso de Privacidad ni de los Términos, ni registro alguno de quién aceptó qué versión y cuándo. | ✅ Corregido |
| **A-3** | 5 | `app.html:198-212`, `index.html:144`, `kiosco.html:38-39` | 7 scripts de CDN sin atributo `integrity`, y `@supabase/supabase-js@2` sin versión fija (servía 2.110.8 y podía cambiar sin aviso). | ✅ Corregido |
| **A-4** | 4 | `supabase/functions/agente-ia/index.ts` | El endpoint más caro de la plataforma no tenía **ningún** límite de uso. Cualquier cuenta con el feature podía invocarlo en bucle contra la cuenta de Anthropic compartida. | ✅ Corregido |
| **A-5** | 9 | `app/aviso-privacidad.html` | **Anthropic no figuraba como transferencia**, pese a que el Agente IA le envía CURP, RFC, NSS, domicilio, identificación oficial y datos de beneficiarios. Tampoco se declaraban los datos de salud (incapacidades) como sensibles, ni había plazos de conservación ni procedimiento de supresión. | ✅ Corregido *(borrador legal)* |
| **A-6** | 2/9 | `app/js/agente.js:_buildDatosCaso` | Se enviaba a Anthropic el expediente completo del trabajador **sin importar el documento**: un acta de amonestación viajaba con NSS, domicilio, identificación oficial y nombre + teléfono de sus beneficiarios (personas que ni siquiera son el titular). | ✅ Corregido |
| **A-7** | 4 | `supabase/functions/checador-kiosco/index.ts:61-78` | Rate limit contado **solo por `kiosco_token`**: 8 fallos en 60 s bloqueaban a toda la sucursal. Cualquiera que viera el QR de recepción podía dejar sin checar a la plantilla entera de forma indefinida. Un cambio de turno con varios errores lo disparaba sin ataque. | ✅ Corregido |

### 🟡 Medias

| ID | Fase | Ubicación | Descripción | Estado |
|----|------|-----------|-------------|--------|
| **M-1** | 8 | `index.html:452` | `traducirError()` terminaba en `` return `Ocurrió un error inesperado: ${msg}` ``, exponiendo mensajes crudos de Postgres (nombres de tablas, constraints, detalle de RLS). | ✅ Corregido |
| **M-2** | 8 | `app/js/app.js:friendlyError` | Mismo problema: devolvía el mensaje crudo cuando no matcheaba ningún patrón conocido. | ✅ Corregido |
| **M-3** | 8 | `checador-kiosco:103`, `checador-webhook:120`, `send-emails:85` | Devolvían `error.message` de Postgres tal cual. `checador-kiosco` es **público, sin sesión**. | ✅ Corregido |
| **M-4** | 8 | `agente-ia` (respuesta final) | Reenviaba al cliente el cuerpo de error de la API de Anthropic sin filtrar. | ✅ Corregido |
| **M-5** | 5 | `netlify.toml` | Solo existían `X-Frame-Options` y `X-Content-Type-Options`. Faltaban HSTS, Referrer-Policy, Permissions-Policy y CSP. | ✅ Corregido |
| **M-6** | 6 (A03) | `app/js/app.js:186` | `${t.puesto \|\| '—'}` sin escapar en los resultados de la búsqueda global. | ✅ Corregido |
| **M-7** | 6 (A03) | `app/js/app.js:184` | `iniciales(t.nombre)` devolvía caracteres crudos al `innerHTML` del avatar. | ✅ Corregido |
| **M-8** | 6 (A03) | `index.html:272` | `mostrarRevisionCorreo(email)` interpolaba en `innerHTML` el correo tecleado por el usuario. | ✅ Corregido |
| **M-9** | 6 (A03) | `checador.js:147,151,152,180,183` | Nombre de sucursal, nombre de trabajador, URL del kiosco y API key interpolados sin escapar en modales. | ✅ Corregido |
| **M-10** | 3 | esquema | Sin constraints de rango: `incapacidades`/`vacaciones`/`periodos_nomina` admitían `fecha_fin < fecha_inicio`; `trabajadores` admitía salario negativo y fechas de ingreso absurdas. | ✅ Corregido |
| **M-11** | 7 | esquema | Nada impedía registrar una baja con fecha **anterior al ingreso** → antigüedad negativa → finiquito mal calculado. | ✅ Corregido |
| **M-12** | 3 | `checador-kiosco` | No validaba tipo, formato ni longitud de `kiosco_token` ni `credencial_valor` en un endpoint público. | ✅ Corregido |
| **M-13** | 6 (A09) | esquema | No existía ninguna bitácora de auditoría: bajas, accesos al expediente y cambios de rol no dejaban rastro. Para un producto de cumplimiento laboral es requisito y argumento de venta. | ✅ Corregido |

### 🔵 Bajas / informativas

| ID | Fase | Ubicación | Descripción | Estado |
|----|------|-----------|-------------|--------|
| **B-1** | 6 (A07) | Supabase Auth | Contraseña mínima de 6 caracteres y protección contra contraseñas filtradas (HaveIBeenPwned) **desactivada** (confirmado por el Advisor). | ⚠️ Verificación manual |
| **B-2** | 5 | Supabase Edge Functions | `ALLOWED_ORIGIN` sigue sin configurar → CORS en `*`. Bloqueado por no tener dominio de producción (decisión previa del usuario, sigue vigente). | ⚠️ Verificación manual |
| **B-3** | 2 | `app/js/*` (≈40 sitios) | Uso extendido de `select('*')` en tablas sensibles. **No es una fuga**: RLS ya acota las filas al propio tenant y las columnas devueltas son las que ese tenant ya posee. | ⏸️ No corregido *(ver §5)* |
| **B-4** | 6 (A04) | `index.html:handleRegistro` | Supabase Auth devuelve "User already registered", que permite enumerar correos. Es comportamiento de la plataforma, no del código. | ⚠️ Verificación manual |
| **B-5** | 10 | `pago-exitoso.html` | El valor de la conversión se lee de la URL (`?valor=`), así que es falsificable. Solo afecta datos de marketing del navegador; la conversión server-side (Meta CAPI) usa el monto real de Stripe y deduplica por `session.id`. | ⏸️ Aceptado |
| **B-6** | 1 | esquema | Ninguna tabla tiene `FORCE ROW LEVEL SECURITY`. | ⏸️ **No corregido a propósito** *(ver §5)* |
| **B-7** | 4 | `checador.js:_asignarPin` | El PIN se genera aleatorio en 1000-9999 y es único por empresa, así que no hay PINes triviales elegidos por el usuario (0000 es imposible). Se guarda en claro y es visible para cualquier usuario de la empresa. Aceptable para un PIN de checador de 4 dígitos. | ⏸️ Aceptado |

### ✅ Verificado correcto (no son hallazgos)

Se comprueban explícitamente para evitar falsos positivos en revisiones futuras:

- **Clave pública de Supabase en el frontend** (`config.js:13`): es la publishable/anon key,
  pública por diseño. Es segura **porque** la Fase 1 pasó — el aislamiento lo hace RLS, no
  el secreto de la clave.
- **Secretos**: no hay ninguna `service_role`, `sk-ant-`, `sk_live`, `sk_test` ni `whsec_`
  en el repo ni en el historial de git. Todas las Edge Functions leen de `Deno.env.get()`.
- **`.gitignore`** cubre `.env`, `.env.local`, `*.pem`, `*.key`.
- **`console.log`**: solo 2 en todo el proyecto, ambos en `webhook-stripe` y con
  identificadores no sensibles (`evento.id`, `session.id`). Cero PII logueada.
- **Firma del webhook de Stripe**: usa `constructEventAsync` (la variante correcta para
  Deno) y `whsec_` viene de variable de entorno. Rechaza con 400 si la firma no valida.
- **Meta CAPI** está envuelta en `try/catch` y nunca puede tumbar el webhook.
- **Storage**: `expedientes` y `reportes` son privados, aislados por carpeta `empresa_id`,
  con whitelist de MIME y límite de tamaño reales en el servidor.
- **RLS**: 34/34 tablas con RLS activa; ninguna política `USING(true)` salvo
  `config_valores` (catálogo de lectura, correcto). `checador_intentos_fallidos` tiene RLS
  sin políticas — es el default seguro deliberado (deniega todo acceso directo).
- **Switch de empresa**: `_seleccionarEmpresa()` llama al RPC `set_empresa_activa`, que
  valida pertenencia real en `usuario_empresas` en servidor; el trigger
  `zz_perfiles_bloquear_cambio_empresa` impide además mover `empresa_id`, `rol` o
  `sucursal_id` por UPDATE directo. No se confía en ningún valor del cliente.
- **Vistas**: no existe ninguna vista en `public` (`v_estado_suscripcion` del prompt no
  está creada), así que el riesgo de `security_invoker` no aplica hoy.
- **SQL dinámico**: no hay ningún `EXECUTE` con concatenación de strings en las 18
  funciones.

---

## 3. Cambios aplicados

### Migración nueva

**`app/migrations/39_fix_auditoria_prelanzamiento.sql`** — idempotente, validada primero con
un dry-run transaccional (`BEGIN … ROLLBACK` con pruebas funcionales de los triggers) y
**APLICADA en producción el 26-jul-2026** vía MCP `apply_migration`, con autorización
explícita del usuario. Verificada en vivo después de aplicar (ver tabla abajo).

> Se aplicó además un complemento `39b_revoke_trigger_functions_authenticated`: el Advisor
> señaló que `zz_bitacora_registrar()` y `zz_validar_fecha_baja()` quedaban ejecutables por
> `authenticated` (se había revocado de `anon` pero no de ahí). Son funciones de **trigger**,
> nadie debe poder invocarlas por RPC. Antes de aplicarlo se comprobó —con
> `SET LOCAL ROLE authenticated` y claims de JWT reales dentro de una transacción revertida—
> que revocar `EXECUTE` **no** impide que los triggers disparen: Postgres verifica ese
> privilegio al CREAR el trigger, no al dispararlo. El archivo de migración ya refleja los
> `REVOKE … FROM authenticated`.

> **Numeración:** se usó 39, no 38. La rama `resignation-option-terminations` tiene
> reservada la 38 para "bajas documentadas como renuncia"; usar 39 evita colisión al mergear.

Contenido:
1. `agente_ia_uso` + `agente_ia_consumir_cuota()` — rate limiting y auditoría de costo del
   Agente IA, con 4 límites configurables en `config_valores` (usuario/empresa × hora/día).
2. `consentimientos_legales` — registro inmutable de aceptaciones (sin políticas de UPDATE
   ni DELETE: un consentimiento alterable no sirve como prueba).
3. `bitacora_auditoria` + `zz_bitacora_registrar()` y triggers en `bajas`,
   `documentos_trabajador` y cambios de `perfiles.rol`.
4. Constraints de integridad (`NOT VALID`, para no poder fallar por datos legados).
5. `zz_validar_fecha_baja()` — coherencia baja/ingreso.
6. Columnas `credencial_hash` e `ip` en `checador_intentos_fallidos`.

### Archivos modificados

**Frontend**
| Archivo | Cambio |
|---|---|
| `app/js/app.js` | Helper `escapeAttrJs()`; escape en búsqueda global (`puesto`, `iniciales`) y en el switcher de empresa; `friendlyError()` ahora detecta errores de motor y devuelve genérico + código de referencia |
| `app/js/checador.js` | `escapeAttrJs()` en los 2 `onclick`; escape en modales de QR, gafete y API key |
| `app/js/nomina.js` | `escapeAttrJs()` en el `onclick` de eliminar periodo |
| `app/js/agente.js` | Minimización de PII por categoría de documento; ya no envía `model`/`max_tokens`; manejo explícito de 429/403; deja de reflejar el error crudo del proveedor |
| `app/js/config.js` | Nueva constante `LEGAL_VERSION` |
| `app/js/consentimiento.js` | **Nuevo** — banner de cookies + registro de aceptación legal |
| `app/index.html` | `escapeHtml()` propio; casilla de aceptación no preseleccionada; aviso simplificado en el punto de captura; `traducirError()` con código de referencia; tracking condicionado a consentimiento; SRI |
| `app/app.html` | SRI + versiones exactas en los 5 CDNs |
| `app/kiosco.html` | SRI + versiones exactas en los 2 CDNs |
| `app/pago-exitoso.html` | Tracking condicionado a consentimiento |
| `app/landing/*.html` (×4) | Tracking condicionado a consentimiento + banner |
| `app/aviso-privacidad.html` | **Reescrito** — marco legal vigente, doble figura responsable/encargado, tabla de datos con los sensibles, Anthropic declarado, ARCO, retención y supresión, cookies |
| `app/terminos.html` | Cláusula de encargo completa (§5), uso de IA, limitación de responsabilidad, reglas de consumidor |

**Backend**
| Archivo | Cambio |
|---|---|
| `supabase/functions/agente-ia/index.ts` | Rate limiting vía `agente_ia_consumir_cuota` (falla cerrado); ya no reenvía el error del proveedor; log diferenciado cuando falta la migración 21 |
| `supabase/functions/checador-kiosco/index.ts` | Validación de formato y longitud del body; rate limit por credencial + IP + sucursal; hash de la credencial; error genérico |
| `supabase/functions/checador-webhook/index.ts` | Error genérico en vez de `error.message` |
| `supabase/functions/send-emails/index.ts` | Error genérico en vez de `error.message` |
| `netlify.toml` | HSTS, Referrer-Policy, Permissions-Policy y CSP etapa 1 |

### Verificación ejecutada

| Qué | Cómo | Resultado |
|---|---|---|
| XSS por `onclick` | Render real en DOM con nombre malicioso | Antes: 3 atributos (`onclick`, `onmouseover`, `x`). Después: 1 (`onclick`) |
| Los 7 hashes SRI | Carga real desde los CDN en navegador | 7/7 `CARGADO`, globals disponibles |
| CSP | Servida como cabecera real desde el servidor de preview | **0 violaciones**; Supabase, gtag, fbevents y el pixel de DoubleClick cargan |
| Permissions-Policy | `document.featurePolicy` en kiosco.html | `camera: true` ✅, `microphone: false`, `geolocation: false` |
| Consentimiento | Ciclo completo en navegador | Sin decidir → banner + **0 scripts de terceros**; Rechazar → 0 scripts; Aceptar → los 3 cargan |
| Casilla de registro | `handleRegistro()` sin marcar | Bloquea con mensaje claro, botón se rehabilita, no llama a la red |
| Migración 39 (dry-run) | `BEGIN … ROLLBACK` en producción con pruebas funcionales | Aplica limpio; bitácora registra `insert/bajas` con detalle; el trigger rechaza baja anterior al ingreso; rollback confirmado |
| **Migración 39 (aplicada)** | Consultas al catálogo tras `apply_migration` | 3/3 tablas creadas con RLS y sus políticas; 4 límites en `config_valores`; 2 columnas nuevas en `checador_intentos_fallidos`; 3 triggers de bitácora + 1 de fecha de baja; los 7 constraints `NOT VALID` presentes |
| Privilegios post-aplicación | `has_function_privilege` | `agente_ia_consumir_cuota`: anon ✗ / authenticated ✓ (correcto, la llama la Edge Function con el JWT del usuario). `zz_bitacora_registrar` y `zz_validar_fecha_baja`: anon ✗ / authenticated ✗ |
| Datos existentes vs. constraints nuevos | Conteo de violaciones en las 5 tablas | **0 violaciones** — ninguna fila actual quedaría bloqueada al editarse |
| Efectos colaterales | Conteo de filas tras todas las pruebas | `bitacora=0`, `usos_ia=0`, `consentimientos=0`, `bajas=1`, `trabajadores=3` — las pruebas no dejaron basura |
| Sintaxis | `new Function()` sobre 12 archivos JS | 12/12 OK; 7/7 páginas HTTP 200 |
| **Cabeceras (deploy preview PR #9)** | `curl -D -` sobre `/`, `/app.html`, `/kiosco.html` | Las 7 cabeceras aplican en las 3; `camera=(self)` presente, que es lo que necesita el lector QR del kiosco |
| **SRI (deploy preview PR #9)** | Descarga de los 7 recursos del CDN y recálculo del SHA-384 | 7/7 hashes coinciden; 7/7 versiones fijadas; supabase-js y html5-qrcode cargan sin error en el navegador |
| **CSP vs. Google Fonts** | `document.fonts` tras `fonts.ready` en el preview | 🔴 **Regresión encontrada y corregida** — ver abajo |

### Regresión de CSP detectada en el deploy preview (corregida)

`css/app.css` abre con un `@import` a Google Fonts y lo cargan **las 10 páginas**. La CSP
inicial no incluía esos hosts, así que la tipografía de marca (Public Sans / Source Serif 4)
no cargaba y todo caía a `system-ui`. No es un fallo de seguridad, pero sí un cambio de
diseño no intencionado, que la auditoría se había propuesto explícitamente no hacer.

Lo relevante para futuras revisiones es **por qué casi se escapa**: la CSP bloquea el
`@import` *antes* de emitir la petición, así que no aparece nada en la pestaña de red ni
error en consola. `document.fonts.check()` tampoco sirve — devuelve `true` porque resuelve a
la fuente de respaldo. La única señal fiable fue `document.fonts` vacío tras esperar
`document.fonts.ready`.

Corregido agregando `https://fonts.googleapis.com` a `style-src` (la hoja de estilo) y
`https://fonts.gstatic.com` a `font-src` (los archivos de fuente). Son dos hosts distintos:
con uno solo la tipografía sigue sin cargar.

---

## 4. Verificación manual requerida

No se puede comprobar desde el código. Pasos exactos:

### 4.1 🔴 Aplicar la migración 21 — desbloquea el Agente IA y el cobro
1. Supabase Dashboard → SQL Editor → New Query.
2. Pegar y ejecutar `app/migrations/21_migration_planes.sql`.
3. Verificar: `select to_regclass('public.planes'), to_regclass('public.suscripciones');` → ninguna nula.
4. Crear la tabla de idempotencia si la 21 no la trae:
   `create table if not exists public.stripe_eventos (event_id text primary key, tipo text, procesado_at timestamptz default now());`
5. Reprobar el Agente IA: debe dejar de devolver 403 para una cuenta con plan Full.

### 4.2 ✅ Migración 39 — YA APLICADA (26-jul-2026)
Aplicada y verificada en producción. No hay nada que hacer aquí. Si se reconstruye la base
desde cero, correr `app/migrations/39_fix_auditoria_prelanzamiento.sql` (ya incluye los
`REVOKE … FROM authenticated` del complemento 39b).

### 4.3 🔴 Redesplegar las 4 Edge Functions — AHORA ES EL PASO BLOQUEANTE
Los cambios de esta auditoría **solo existen como código fuente** hasta que se desplieguen.
La 39 ya está aplicada, así que `agente_ia_consumir_cuota` existe y el rate limit funcionará
en cuanto se despliegue `agente-ia`.

> ⚠️ **`checador-kiosco` es el más urgente**: la migración ya agregó las columnas
> `credencial_hash` e `ip`, pero la función desplegada todavía es la vieja, que inserta sin
> ellas y sigue contando fallos **solo por sucursal**. No está roto (las columnas admiten
> NULL), pero el bug de disponibilidad del kiosco sigue vivo hasta el redespliegue.
```
supabase functions deploy agente-ia
supabase functions deploy checador-kiosco --no-verify-jwt
supabase functions deploy checador-webhook --no-verify-jwt
supabase functions deploy send-emails
```

### 4.4 🟠 Supabase Auth — endurecer contraseñas
Dashboard → Authentication → Policies:
- Activar **Leaked password protection** (check contra HaveIBeenPwned). Hoy está apagado.
- Subir la longitud mínima de 6 a **10 caracteres**. Si se cambia, actualizar también el
  texto de `index.html` ("mínimo 6 caracteres") y la traducción de error correspondiente.

### 4.5 🟠 Supabase Auth — CAPTCHA y rate limiting
Dashboard → Authentication → Settings:
- **Attack Protection → Enable CAPTCHA**: elegir hCloudflare Turnstile o hCaptcha, pegar el
  site key y el secret. Es la ruta nativa y no requiere código; cubre registro, login y
  recuperación de contraseña de una vez. **Preferir esto a cualquier implementación propia.**
- Revisar **Rate Limits**: correos por hora, intentos de verificación de token y de login.
  Anotar los valores que queden configurados.

### 4.6 🟡 Verificar los secrets de las Edge Functions
Dashboard → Edge Functions → Secrets. Deben existir:
`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `META_PIXEL_ID`,
`META_CAPI_TOKEN`, `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `FROM_EMAIL`.
Sin ellos las funciones desplegadas responden 500 al invocarse. (No hay herramienta para
listarlos programáticamente; hay que verlo en el Dashboard.)

### 4.7 🟡 Completar los documentos legales
En `app/aviso-privacidad.html` y `app/terminos.html`, sustituir:
`[RAZÓN SOCIAL O NOMBRE DEL RESPONSABLE]`, `[DOMICILIO COMPLETO]`, `[CORREO DE CONTACTO]`.
Después, **quitar el recuadro naranja** de "Documento en revisión legal" solo cuando un
abogado los haya validado.

### 4.8 🟡 Rellenar los IDs de tracking
`app/js/config.js` tiene placeholders (`AW-XXXXXXXXXX`, `XXXXXXXXXXXXXXX`) con
`TRACKING_ENABLED: true`. Hoy eso genera errores de "Invalid PixelID" en consola de todos
los visitantes. O se ponen los IDs reales, o se pone `TRACKING_ENABLED: false` hasta tenerlos.

### 4.9 🔵 Confirmar las cabeceras en producción
Tras desplegar, comprobar que Netlify sí las emite:
```
curl -sI https://TU-DOMINIO/ | grep -iE "strict-transport|content-security|referrer|permissions|x-frame|x-content"
```
Deben aparecer las 6. Después, navegar por la app con la consola abierta y confirmar cero
mensajes de "Refused to load / Content Security Policy". Se probó en local con las mismas
cabeceras y hubo 0 violaciones, pero conviene confirmarlo con tráfico real.

### 4.10 🔵 IP de los consentimientos
La columna `ip` de `consentimientos_legales` queda nula desde el navegador: la página no
conoce su IP pública y **deliberadamente no se consulta a ningún servicio externo** para
averiguarla (sería una transferencia de datos nueva, no declarada, solo para llenar una
columna). La IP real de cada alta está en los logs de Supabase Auth y se correlaciona por
`usuario_id` + marca de tiempo. Si se necesita en la propia tabla, la ruta limpia es una
Edge Function que la lea de `x-forwarded-for`.

---

## 5. Pendientes con decisión de negocio

### 5.1 🔴 Conectar el cobro de punta a punta *(C-1, C-2)*
No lo implementé porque **inventar la lógica de negocio del cobro no es una corrección de
seguridad**: hay que decidir qué plan corresponde a cada precio de Stripe, qué pasa al
fallar un pago (¿degradar a Free? ¿bloquear? ¿periodo de gracia?) y qué se hace con los
trabajadores que exceden el límite del plan nuevo. Falta:
- La Edge Function `crear-checkout-suscripcion` (no existe).
- El paso 3 de `webhook-stripe` (activar la suscripción).
- Manejar `invoice.payment_failed`, `customer.subscription.updated` y
  `customer.subscription.deleted` — hoy solo se procesa `checkout.session.completed` y
  **todo lo demás se ignora con un 200**, así que una cancelación o un impago no degradan
  nada.

Lo que **sí** está bien y no hay que tocar: la validación de firma con `constructEventAsync`,
el secret desde entorno, y el aislamiento en `try/catch` de la Meta CAPI.

### 5.2 🟡 CSP etapa 2 — retirar `'unsafe-inline'`
La CSP de la etapa 1 ya cierra `default-src`, `object-src`, `base-uri` y `frame-ancestors`,
pero **conserva `'unsafe-inline'` y `'unsafe-eval'` en `script-src`**, así que no protege
contra XSS reflejado. Retirarlos exige:
1. Migrar ~200 handlers `onclick=` a `data-*` + `addEventListener` delegado. El listener
   delegado global de Enter/Espacio que ya existe en `app.js` establece el patrón a seguir.
2. Sacar los bloques `<script>` inline de `index.html` y `kiosco.html` a archivos propios.
3. Confirmar que ni `xlsx` ni `jspdf` necesitan `eval` en las rutas que usa la app.

Es un refactor grande y de riesgo de regresión alto. **No lo hice ahora a propósito** —
requiere una ventana de pruebas dedicada, no ir montado en una auditoría.

### 5.3 🟡 `FORCE ROW LEVEL SECURITY` *(B-6)*
**Recomiendo NO activarlo.** `FORCE` solo afecta al *dueño* de la tabla (`postgres`), y las
funciones `SECURITY DEFINER` del proyecto —`registrar_checada`, `setup_empresa`,
`set_empresa_activa`, `send_emails_claim`— corren precisamente como ese dueño y dependen de
**no** estar sujetas a RLS. Activarlo las rompería. Además el beneficio es nulo aquí: nada
de la app se conecta como owner (el frontend usa `authenticated`, las Edge Functions usan
`service_role`, que salta RLS por atributo de rol y no por ownership). Documentado en el
encabezado de la migración 39.

### 5.4 🔵 `select('*')` en tablas sensibles *(B-3)*
Hay ~40 llamadas. **No las cambié.** RLS ya limita las filas al propio tenant, y las
columnas expuestas son datos que ese tenant ya posee — no hay cruce de frontera. Reescribir
40 consultas a listas explícitas de columnas introduce un riesgo real de romper cálculos de
nómina (que leen campos que no siempre son obvios en el render) a cambio de un beneficio de
seguridad marginal. **Si se quiere hacer, hacerlo módulo por módulo con pruebas**, no en
barrido. Lo dejo señalado, no ejecutado.

### 5.5 🔵 Enumeración de usuarios en el registro *(B-4)*
Supabase Auth responde "User already registered". Ocultarlo requiere cambiar el flujo de
alta (responder siempre igual y avisar por correo), lo que empeora la UX de forma notable
para una aplicación B2B donde el correo del contacto no es un secreto. **Recomiendo
aceptarlo** y mitigarlo con el CAPTCHA del punto 4.5, que es lo que realmente frena la
enumeración masiva.

### 5.6 🔵 Rutas de fallo no ejercitadas *(Fase 7)*
De la matriz de 17 casos, se cubrieron por código los que dependen del código: fechas
imposibles (constraints + trigger de la migración 39), nombres con `<script>` y comillas
(escape verificado), archivo de 500 MB o `.exe` renombrado (el bucket valida MIME real y
tamaño **en servidor**, no solo la extensión), sesión sin fila en `perfiles` (`PGRST116` ya
manejado), y límite de plan con mensaje claro (`esErrorDePlan`/`mensajeErrorPlan` ya existen).

**Quedan sin ejercitar por requerir credenciales o servicios externos reales:** los 5 casos
de Stripe (7 al 13 de tu lista), los de correo de verificación caducado y doble clic, y el
de pérdida de conexión a media checada. Recomiendo correrlos manualmente en el entorno de
pruebas de Stripe **después** de cerrar el punto 5.1, porque hoy varios de ellos ni siquiera
son alcanzables (el webhook falla antes por la tabla que no existe).

---

## 6. Checklist de re-verificación antes de cada release

```
[ ] get_advisors (security) sin hallazgos nuevos de nivel ERROR
[ ] Toda tabla nueva: RLS habilitada + políticas SELECT/INSERT/UPDATE/DELETE
    explícitas filtrando por mi_empresa_id()
[ ] Toda función nueva (trigger o no): SET search_path = public, pg_temp
[ ] Toda función SECURITY DEFINER nueva: REVOKE EXECUTE ... FROM anon EXPLÍCITO
    (REVOKE FROM PUBLIC NO basta — Supabase otorga grants directos a anon)
[ ] Cero `select('*')` NUEVO en tablas con datos sensibles
[ ] Cero interpolación sin escapar en innerHTML: usar escapeHtml()
[ ] Cero `onclick="fn('${dato}')"` sin escapeAttrJs()
[ ] Cero console.log con CURP, NSS, salarios, tokens o JWTs
[ ] Edge Functions: mensaje genérico al cliente, detalle solo en el log
[ ] Edge Functions: empresa_id derivado del JWT, nunca del body
[ ] Si se sube la versión de un CDN: RECALCULAR el hash SRI
      curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A
[ ] Si se agrega un dominio externo: añadirlo a la CSP de netlify.toml
[ ] Si cambia el aviso de privacidad o los términos: subir LEGAL_VERSION en config.js
[ ] Si se agrega un tipo de documento al Agente IA: clasificarlo en
    _CAMPOS_SENSIBLES_POR_CATEGORIA (sin clasificar, cae al perfil más restrictivo)
[ ] Migración nueva: dry-run BEGIN/ROLLBACK antes de aplicar en firme
[ ] Cabeceras vivas en producción: curl -sI | grep -iE "strict-transport|content-security"
[ ] Consola del navegador sin violaciones de CSP tras el despliegue
```

---

## Anexo — marco legal aplicado

La **Ley Federal de Protección de Datos Personales en Posesión de los Particulares** vigente
es la publicada en el DOF el **20 de marzo de 2025**, en vigor desde el **21 de marzo de
2025**, que abrogó la ley homónima de 2010. El **INAI fue extinguido** y sus atribuciones en
materia de datos personales en posesión de particulares pasaron a la **Secretaría
Anticorrupción y Buen Gobierno**. El medio de defensa pasó a ser el juicio de amparo ante
juzgados especializados, en sustitución del juicio de nulidad ante el TFJA.

Verificado por búsqueda web el 26-jul-2026, conforme pediste. **No se citan números de
artículo en los documentos generados**, precisamente porque no los confirmé contra el texto
oficial. Fuentes:
[Garrigues](https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares) ·
[EY México](https://www.ey.com/es_mx/technical/tax/boletines-fiscales/nueva-ley-federal-proteccion-datos-personal-posesion-particulares) ·
[IDC](https://idconline.mx/corporativo/2025/03/21/publican-nuevas-leyes-sobre-acceso-a-informacion-publica-y-proteccion-de-datos-personales)

> **Los documentos legales generados son borradores para revisión de un abogado**, no texto
> final. Están marcados como tales dentro de las propias páginas.
