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

### 💳 Planes y suscripciones
| # | Archivo | Qué hace |
|---|---------|----------|
| 21 | `21_migration_planes.sql` | `planes`, `suscripciones`, triggers de enforcement (`zz_*`), índices de rendimiento y **supersede** `handle_new_user()` + `setup_empresa()` + `admin_set_plan()` |

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
| función `handle_new_user()` | 00, 21 | **21** |
| función `setup_empresa()` | 21 | **21** |
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
