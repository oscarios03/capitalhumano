# Migraciones — Capital Humano MX

Aplicar en Supabase (SQL Editor → New Query → Run) **en orden numérico**.
Todas son **idempotentes** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` + `CREATE POLICY`), así que
correr una migración dos veces no rompe nada.

> Proyecto Supabase en producción: **KAPITAL HUMANO** (`xqbzxkujooarntawzsoc`).

---

## Índice por tema

### 🏗️ Base y estructura
| # | Archivo | Qué hace |
|---|---------|----------|
| 00 | `00_setup.sql` | Schema base: `empresas`, `perfiles`, `trabajadores`, `asistencia`, `actas`, `contratos`, `bajas`, `sucursales` + RLS + `get_or_create_matriz()` + `handle_new_user()` |
| 01 | `01_migration_sucursales.sql` | Redefine `sucursales` (centros de trabajo) y **supersede** `get_or_create_matriz()` |
| 02 | `02_migration_trabajadores_v2.sql` | Campos adicionales en `trabajadores` (INFONAVIT/pensión planos, etc.) |
| 11 | `11_migration_trabajadores_v3.sql` | **37 columnas** en `trabajadores` (personales, jornada, contrato, beneficiarios, contacto de emergencia). **Obligatoria en instalaciones nuevas**: sin ella el alta/edición de trabajadores falla |
| 34 | `34_migration_trabajadores_v4.sql` | `fecha_nacimiento` (sustituye a `edad` como fuente de verdad), `sexo`, `telefono` (WhatsApp), `metodo_pago`/`monto_efectivo`; backfill desde la CURP; amplía `tipo_documento_enum` con `resguardo` y los tipos del semáforo de expediente |

### ⏱️ Asistencia y checador
| # | Archivo | Qué hace |
|---|---------|----------|
| 03 | `03_migration_asistencia.sql` | Amplía `asistencia` (tipos) y crea una versión mínima de `periodos_nomina` |
| 13 | `13_migration_checador.sql` | Reloj checador: PIN/QR, token de kiosco por sucursal, tablas `checadas` e `integraciones_checador`, `asistencia.origen`, función `registrar_checada()` |
| 15 | `15_migration_festivos.sql` | `config_valores` (UMA/SMG), `dias_festivos` (oficiales + propios) y **supersede** `registrar_checada()` (marca festivos) |

### 💰 Nómina
| # | Archivo | Qué hace |
|---|---------|----------|
| 04 | `04_migration_nomina.sql` | Tablas `periodos_nomina` (completa) y `recibos_nomina` + RLS. Incluye red de seguridad `ALTER` para columnas que 03 pudo omitir |
| 05 | `05_migration_nomina_v2.sql` | Columnas de percepciones/deducciones en `recibos_nomina` (comisiones, primas, fondo de ahorro, INFONAVIT, pensión) |
| 06 | `06_migration_nomina_dias_pago.sql` | `empresas.dia_pago_semanal` |
| 14 | `14_migration_prestaciones.sql` | Prestaciones de empresa (prima dominical, factor de horas extra, vales), columnas en `recibos_nomina` |
| 17 | `17_migration_prestamos_descuentos.sql` | `descuentos_trabajador` y `descuentos_aplicados` (INFONAVIT/FONACOT/pensión/préstamo con prioridad legal) |
| 18 | `18_migration_prestaciones_fiscal.sql` | `prestaciones_trabajador` con desglose exento/gravado (previsión social) |
| 19 | `19_migration_sbc_movimientos.sql` | `movimientos_imss`, `trabajadores.sbc` y factor de integración (Art. 27 LSS) |
| 22 | `22_migration_nomina_programacion.sql` | `periodos_nomina.fecha_pago`, días de pago quincenal/mensual en `empresas`, función `generar_alertas_nomina()` |
| 32 | `32_migration_fiscal_patronal.sql` | **Costo patronal**: `empresas.prima_riesgo_pct` / `entidad_federativa` / `isn_pct`; `recibos_nomina.imss_patronal` / `infonavit_patronal` / `isn` / `subsidio_empleo` / `ajuste_anual_isr`; subsidio al empleo 2026 en `config_valores` |
| 35 | `35_migration_nomina_extras.sql` | **Fase 6 (parcial — layouts bancarios pendientes)**: amplía el CHECK de `descuentos_trabajador.tipo` con `prestamo_caja`; `recibos_nomina.metodo_pago` / `monto_efectivo` (snapshot del pago mixto configurado en `trabajadores`, migración 34) |

### 🔔 Alertas y notificaciones
| # | Archivo | Qué hace |
|---|---------|----------|
| 07 | `07_migration_alertas.sql` | Tabla `alertas` + función `generar_alertas()` |
| 10 | `10_migration_email_notifications.sql` | `email_queue` + trigger `encolar_notificacion_alerta()` + columnas en `empresas` |
| 16 | `16_migration_alertas_contratos.sql` | **Supersede** `generar_alertas()` (agrega capacitación inicial y nómina por pagar) |

### 📁 Expediente, PTU, resguardos y multiempresa
| # | Archivo | Qué hace |
|---|---------|----------|
| 08 | `08_migration_nuevas_funciones.sql` | `vacaciones`, `incapacidades`, `ptu_ejercicios`, `ptu_detalle`, `usuario_empresas` |
| 09 | `09_migration_historial_salarios.sql` | `historial_salarios` + índices + RLS |
| 12 | `12_migration_expediente_digital.sql` | `documentos_trabajador` (expediente digital) |
| 20 | `20_migration_resguardos.sql` | `resguardos` (equipo/herramienta asignada) |

### 🔐 Roles y permisos
| # | Archivo | Qué hace |
|---|---------|----------|
| 33 | `33_migration_roles.sql` | **Roles** `admin`/`gerente`/`capturista`/`consulta`: `perfiles.sucursal_id`, CHECK de roles, helpers (`get_mi_rol`, `mi_empresa_id`, `puede_gestionar`, `es_admin`), `admin_set_rol()`, `listar_usuarios_empresa()`, tabla `invitaciones`, **supersede** `handle_new_user()` y `zz_perfiles_bloquear_cambio_empresa()`. Sustituye las políticas `FOR ALL` por SELECT/INSERT/UPDATE/DELETE con gate por rol. Cierra dos huecos: auto-vinculación a cualquier empresa vía `usuario_empresas` y la imposibilidad de que un admin viera a sus usuarios |

### 💳 Planes y suscripciones
| # | Archivo | Qué hace |
|---|---------|----------|
| 21 | `21_migration_planes.sql` | `planes`, `suscripciones`, triggers de enforcement (`zz_*`), índices de rendimiento y **supersede** `handle_new_user()` + `setup_empresa()` + `admin_set_plan()` |

### 🐛 Fase beta — reportes de bug
| # | Archivo | Qué hace |
|---|---------|----------|
| 37 | `37_migration_reportes_bug.sql` | Canal de reportes de la beta: tablas `reportes_bug` y `reporte_bug_notas` (notas internas del dev, aisladas del usuario), tabla `desarrolladores` + helper RLS `es_desarrollador()` (compuerta cross-empresa, **fuera** del sistema de 4 roles de la 33), políticas de Storage del bucket `reportes` y `encolar_resumen_reportes()` (correo-resumen diario vía `email_queue`). **Requiere pasos manuales**: crear el bucket `reportes` en el Dashboard y programar el `pg_cron` del resumen (ver comentarios en la migración). Nota: el **36** quedó reservado para la migración pendiente de nómina/ausencias |

---

## ⚠️ Definiciones supersedidas (misma función/tabla en varias migraciones)

Esto **no es un error**: es la evolución natural de migraciones idempotentes. La versión
**vigente** es siempre la de la migración con número más alto (`CREATE OR REPLACE` para
funciones; para tablas, gana la primera `CREATE` y las posteriores agregan columnas por
`ALTER`). Al modificar una función, editar **solo su definición canónica**:

| Objeto | Definido en | ✅ Canónico (vigente) |
|--------|-------------|----------------------|
| función `get_or_create_matriz()` | 00, 01 | **01** |
| función `registrar_checada()` | 13, 15 | **15** |
| función `generar_alertas()` | 07, 16 | **16** |
| función `handle_new_user()` | 00, 21, **33** | **33** ⚠️ |
| función `setup_empresa()` | 21 | **21** |
| función `zz_perfiles_bloquear_cambio_empresa()` | auditoría, **33** | **33** |

> ⚠️ **`handle_new_user()` — cuidado con la 21.** La 33 la supersede para
> consumir las invitaciones, e incluye el alta de suscripción de prueba de la
> 21 condicionada a que la tabla `suscripciones` exista (para funcionar con o
> sin la 21 aplicada). **Si algún día aplicas la 21 por separado, vuelve a
> correr la 33 después**, o los usuarios invitados dejarán de entrar a la
> empresa que los invitó.
| tabla `sucursales` | 00, 01 | **01** (00 es la versión mínima) |
| tabla `periodos_nomina` | 03, 04 | **04** (03 crea la versión mínima; 04 completa columnas por `ALTER`) |

## Notas operativas
- **No hay lógica duplicada activa**: cada función existe una sola vez en la base
  (verificado); las apariciones múltiples arriba son versiones superpuestas donde la
  última gana.
- Las migraciones se aplican **manualmente** (SQL Editor), no por CLI, así que la tabla
  `supabase_migrations.schema_migrations` no refleja el historial completo — la fuente de
  verdad es esta carpeta.
- Edge Functions relacionadas: `send-emails/` (migración 10), `checador-kiosco` y
  `checador-webhook` (migración 13). Configurar sus variables de entorno antes de usarlas.

## 📅 Valores que caducan cada año

Estos datos tienen fecha de caducidad legal y hay que actualizarlos a mano. Ver
`docs/casos-prueba-fiscal.md` para revalidar los cálculos después de cada cambio.

| Valor | Dónde vive | Cuándo cambia |
|-------|-----------|---------------|
| UMA diaria | `config_valores` (migración 15) | INEGI la publica ~10 de enero; vigente el 1 de febrero |
| Salario mínimo | `config_valores` (migración 15) | CONASAMI, vigente el 1 de enero |
| Subsidio al empleo (% de UMA y límite) | `config_valores` (migración 32) | Decreto en el DOF, cada diciembre |
| Tarifas ISR mensual y anual | `ISR_MENSUAL_2026` / `ISR_ANUAL_2026` en `app/js/nomina.js` | Anexo 8 de la RMF, cada diciembre. Solo cambian si la inflación acumulada rebasa 10% (Art. 152 LISR) — para 2026 sí cambiaron (13.21%) |
| Tabla CEAV patronal | `CEAV_PATRONAL_2026` en `app/js/calculo.js` | Sube cada enero hasta 2030 (reforma de pensiones, DOF 16/12/2020) |
| Prima de riesgo de la empresa | `empresas.prima_riesgo_pct` (la captura el usuario) | Declaración anual ante el IMSS de febrero |
