# Reporte de Fase 1 — Bloqueantes

**Rama:** `claude/capital-humano-legal-audit-cf0c3c`
**Fecha:** 26 de julio de 2026
**Alcance:** P0-1, P0-2, P0-3, P0-5, P0-6, P1-1, P1-2, P1-10 + dos defectos no catalogados

---

## Fuente legal usada

Todo se verificó contra el texto consolidado de la **Ley Federal del Trabajo publicado por la Cámara de Diputados, última reforma DOF 14-05-2026** (`diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf`). Art. 47 en pp. 15-16; transitorios del decreto de jornada en p. 454.

Esto importa porque **la auditoría contiene dos errores de fundamento** que se habrían propagado al código si se hubiera seguido al pie de la letra. Están documentados abajo.

---

## Hallazgos remediados

| # | Hallazgo | Commit |
|---|---|---|
| P0-3 | Plazos de impugnación mal citados | `a8b9347` |
| P1-2 | Descuento ilegal por falta de preaviso | `d4f9dae` |
| P0-6 | Jurisdicción nula + hardcode de León | `4cb56e1` |
| P1-10 | Vigencias SMG/UMA como error bloqueante | `62b7f43` |
| P0-5 | Exención de ISR sobre UMA | `828e367` |
| P1-1 | Jornada: régimen de transición 2026-2030 | `f473a1a` |
| P0-2 | Fracciones reales del art. 47 en el catálogo | `3ae6f9b` |
| P0-1 | Cuatro generadores de aviso | `8da1164` |
| P0-2 | Alertas de plazos fatales | `042596b` |
| — | Kit de defensa perdía 3 de 6 secciones | `0fc0061` |
| P1-10 | Barrido final de valores hardcodeados | `856417f` |

---

## Correcciones a la propia auditoría

### 1. No existe la fracción XI Bis del art. 47

La auditoría cita *"art. 47 fr. XI Bis"* para el acoso sexual (P2-4), igual que hacía `calculo.js`. **El art. 47 no tiene fracción XI Bis.** Sus fracciones son I a XV, más XIV Bis. El acoso y hostigamiento sexual es la **fracción VIII**.

El error estaba en el código y se propagó al documento de auditoría. El catálogo completo tenía siete fracciones mal asignadas:

| Conducta | Citaba | Es |
|---|---|---|
| Negativa a medidas de seguridad | VII | **XII** |
| Daño intencional | IV | **V** |
| Daño por negligencia grave | V | **VI** |
| Embriaguez o narcóticos | VIII | **XIII** |
| Revelación de secretos | VII | **IX** |
| Acoso u hostigamiento sexual | XI Bis | **VIII** |
| Desobediencia (rescisoria) | 134 fr. II | **47 fr. XI** |

Dos entradas distintas reclamaban la fr. VII. En un aviso que se exhibe en juicio, una fracción mal citada tumba la rescisión.

### 2. La jornada semanal es el art. 59, no el 61

La auditoría (P1-1) y el prompt de remediación citan el **art. 61** para el máximo semanal. El art. 61 regula la jornada **diaria** (8 diurna, 7 nocturna, 7.5 mixta). El máximo semanal lo fija el **art. 59**.

La tabla de la auditoría (48/46/44/42/40) **sí es correcta**: está en el Transitorio Segundo del decreto DOF 01-05-2026.

### 3. La tabla de horas extra del prompt estaba incompleta

El prompt daba `HORAS_EXTRA_MAX_SEMANA = { 2026: 9, 2030: 12 }`. El Transitorio Cuarto establece **2026:9, 2027:9, 2028:10, 2029:11, 2030:12**. Con la tabla incompleta y la lógica `?? 9` del propio prompt, 2028 habría devuelto 9 en vez de 10.

### 4. La falta de aviso admite prueba en contrario

La auditoría dice que la falta del aviso *"por sí sola determina la separación como injustificada"*. El texto vigente, tras la reforma de 2019, dice que **"presumirá la separación no justificada, salvo prueba en contrario"**. Es una presunción, no una determinación. No cambia ninguna decisión de diseño, pero sí el tono de lo que se le promete al usuario.

---

## Decisiones tomadas y por qué

**No se conservó alias funcional de `generateAvisoRecision`.** La regla 4 pide alias `@deprecated`, pero un alias que siga emitiendo el PDF con los arts. 49 y 50 mantiene viva justo la confesión que había que eliminar. Queda como stub que lanza un error explicando qué documento usar. Su único llamador era `bajas.js:271`.

**El respaldo local de vigencias se conservó, pero indexado por año.** Un respaldo *sin fecha* es peligroso; uno *con año* es seguro por construcción, porque nunca se aplica a un ejercicio distinto del suyo. Se sembró con los valores verificados de 2025 y 2026.

**`vigencias.js` distingue tres estados, no dos.** El snippet del prompt sólo contemplaba "hay valor" / "no hay valor". Falta un tercero: el caché aún no cargado. `getConfigValor` es síncrono sobre un caché que se llena de forma asíncrona, así que sin esa distinción la app fallaría en cualquier conexión lenta. El estado transitorio produce un mensaje de reintento, no un error de configuración.

**Días hábiles con calendario judicial, no el de la empresa.** El prompt pedía usar `festivos.js`, que incluye los días de descanso propios de cada empresa. El plazo del art. 47 corre ante el Tribunal y su calendario no es el del patrón: descontar los días propios alargaría el plazo aparente y llevaría a perderlo. Se excluyen sábados, domingos y sólo los festivos **oficiales** del art. 74.

**El plazo del 517 se cuenta como mes calendario.** El prompt usaba indistintamente "un mes" y "30 días naturales". No son lo mismo en febrero ni en julio, y la ley dice "un mes".

**La rama `injustificada` ya no emite aviso alguno.** Sin causa que invocar no hay aviso del art. 47 que dar. Antes emitía el aviso con los arts. 49 y 50 — es decir, el documento sobraba justo donde condenaba y faltaba donde protege.

**Se completó el catálogo a las 16 fracciones.** Cubría 10. Sin las faltantes (I, IV, VII, XIV, XIV Bis, XV) el aviso del art. 47 no podría emitirse para esos supuestos, de modo que era un requisito funcional del punto 1.1, no una ampliación de alcance.

---

## Lo que decidí NO hacer

**No toqué la cláusula de movilidad abierta** (*"o en el lugar que EL PATRON designe"*), pese a estar en la misma frase que edité para la jornada. Es P1-4, punto 2.6.1 de la Fase 2, y su corrección exige enumerar las sucursales registradas, no sólo borrar la frase.

**No reescribí la declaración del recibo de finiquito.** Sigue diciendo *"no tiene reclamacion adicional alguna"* y citando *"Articulos 50, 76, 80, 87 y 162"*. Es P0-4, punto 2.1 Acción A, y se reescribe completo en la Fase 2 junto con el convenio ratificado. **Es el único documento firmable que aún cita el art. 50.**

**No endurecí la carta de renuncia** (P2-2 / punto 2.4) ni validé el período de prueba (P1-3 / punto 2.3): ambos son Fase 2.

**No apliqué las migraciones 40 ni 41.** Requieren acceso al proyecto de Supabase y decisión de despliegue.

---

## Dudas jurídicas pendientes

1. **Exención de ISR con menos de seis meses de servicio.** Se conservó `Math.max(aniosComputables, 1)` porque el prompt lo especifica literalmente, pero eso concede un año completo de exención a quien trabajó tres meses. El art. 93 fr. XIII LISR exenta "por cada año de servicio" y computa como año completo la fracción **mayor** a seis meses; no dice qué pasa por debajo. Conceder de más significa retener ISR de menos. **¿Se confirma el mínimo de un año o se prorratea?**

2. **Aviso del art. 47 cuando no hay negativa.** El precepto dice que el aviso se entrega personalmente *"o bien"* se comunica al Tribunal dentro de cinco días hábiles. La redacción admite leer la vía judicial como alternativa libre, no sólo como remedio a la negativa. Hoy el sistema sólo ofrece el escrito al Tribunal cuando se marca la negativa. **¿Debe ofrecerse siempre?**

3. **Interrupción del plazo del art. 517 fr. I.** El bloqueo asume que el mes corre continuo desde el conocimiento. Si en la práctica del despacho hay supuestos de suspensión o interrupción (investigación interna en curso, incapacidad del trabajador), la advertencia daría falsos positivos. Por eso es confirmación explícita y no bloqueo absoluto. **¿Existen esos supuestos en su criterio?**

4. **Contrato por comisión: período de prueba.** Sigue con 60 días hardcodeados, valor que el art. 39-A no prevé. Está catalogado como Fase 2 (punto 2.3), pero **hoy se está firmando**. ¿Se adelanta?

---

## Verificación

| Comprobación | Resultado |
|---|---|
| `node --check` sobre los 41 módulos | sin errores |
| Términos prohibidos en el aviso del art. 47 | ninguno |
| Validaciones de captura que interrumpen la generación | 7 de 7 |
| Fracciones del art. 47 cubiertas por el catálogo | 16 de 16 |
| Causales rescisorias con fracción real | 17 de 17 |
| Tabla de jornada y horas extra 2025-2031 | correcta |
| Redondeo de la exención de ISR en el límite de 6 meses | correcto |
| Días hábiles (festivo oficial vs. propio de empresa) | correcto |
| Valores legales hardcodeados fuera de `vigencias.js` | ninguno |
| Kit de defensa en modo Blob sin descargas sueltas | correcto |

### Regresión pendiente de prueba manual

No se ejecutó la app contra Supabase. **Falta probar en navegador:** alta de trabajador, generación de los 5 tipos de contrato, flujo de baja completo en las tres ramas, Kit de defensa y nómina.

Riesgo concreto a vigilar: `_exigirCiudad` y `_exigirJornadaLegal` ahora **interrumpen** la generación de contratos. Una empresa sin ciudad configurada, o con un horario que sume más de 48 horas semanales, dejará de poder emitir contratos hasta corregir el dato. Es el comportamiento buscado, pero conviene revisar los datos existentes antes de desplegar.

---

## Migraciones nuevas

| Archivo | Contenido |
|---|---|
| `40_migration_rescisiones.sql` | Tabla `rescisiones` con RLS por empresa, CHECK de fracción válida y coherencia de fechas |
| `41_alertas_plazos_rescision.sql` | `generar_alertas_rescision()`, `dias_habiles_transcurridos()`, `fecha_limite_habil()` |

**Numeradas desde 40** porque 38 y 39 están tomadas por ramas en vuelo (`38_migration_bajas_documentadas`, `39_fix_auditoria_prelanzamiento`). Son independientes y pueden aplicarse en cualquier orden respecto de aquéllas.

`alertas.js` invoca `generar_alertas_rescision` de forma tolerante: si la migración no está aplicada, avisa en consola y no rompe el resto de las alertas.
