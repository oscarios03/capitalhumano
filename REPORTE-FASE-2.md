# Reporte de Fase 2 — Cierre jurídico real

**Rama:** `claude/capital-humano-legal-audit-cf0c3c`
**Fecha:** 26 de julio de 2026
**Alcance:** P0-4, P1-3, P1-4, P1-5, P1-6, P1-7, P1-8, P1-9, P1-11, P2-1, P2-2, P2-8

---

## Fuente legal usada

La misma que en la Fase 1: texto consolidado de la **Ley Federal del Trabajo publicado por la Cámara de Diputados, última reforma DOF 14-05-2026**. Cada artículo nuevo que se cita en un documento firmable se leyó en la fuente antes de escribirlo — no se citó ninguno de memoria.

Artículos verificados en esta fase: **5º fr. XIII** (nulidad de la renuncia de derechos), **25** (contenido del escrito, fracciones IV, V y X), **30** (contrato mínimo), **33** (convenios y su ratificación), **35** (duración de las relaciones), **39** (prórroga), **39-A a 39-F** (prueba y capacitación inicial), **42 fr. VIII** y **43 fr. V** (suspensión por temporada), **42 Bis** (contingencia sanitaria), **47**, **51**, **53 fr. I**, **115**, **162 fr. III**, **163** (invenciones), **501**, **503**.

---

## Hallazgos remediados

| # | Hallazgo | Commit |
|---|---|---|
| P0-4 (A) | Recibo de finiquito/liquidación citaba el art. 50 y contenía renuncia de derechos | `c7d60d9` |
| P0-4 (B/C) | Faltaba el Convenio de Terminación ratificable + anexo instructivo | `e7b7e26` |
| P2-1 | Acta administrativa sin cierre, audiencia ni testigos identificables | `5bfed06` |
| P1-9 | Prima de antigüedad negada en rescisión justificada con <15 años | `93ec852` |
| P2-2 | Carta de renuncia con fundamento incorrecto y declaraciones autoservidas | `30d7421` |
| P1-4 · P1-5 · P1-6 · P1-7 · P1-8 · P1-11 · P2-8 | Siete cláusulas nulas o inexactas del contrato | `25bb2d5` |
| P1-3 | Comisión Mixta de Productividad + validación del art. 39-D | `7e635c6` |

---

## Errores de fundamento encontrados en el código (adicionales a los de la Fase 1)

Los cuatro se detectaron al verificar contra la fuente oficial, no estaban señalados en la auditoría.

### 1. El art. 42 Bis no regula el trabajo por temporada

El contrato por temporada se titulaba y fundaba en el *"Art. 42 Bis LFT"*, tanto en el PDF como en la plantilla del agente IA. **El art. 42 Bis es la suspensión por contingencia sanitaria declarada por autoridad competente**, sin relación con el trabajo de temporada.

El fundamento correcto es el **art. 35** (que admite la relación por temporada) y, para la suspensión entre temporadas, el **art. 42 fr. VIII** con la duración que fija el **art. 43 fr. V**.

### 2. El art. 51 no fundamenta la renuncia voluntaria

La carta de renuncia se subtitulaba *"Ley Federal del Trabajo — Artículo 51"*. El **art. 51 regula la rescisión CON causa imputable al patrón** por parte del trabajador — el espejo del art. 47. Citarlo en una renuncia simple sugiere que hubo una causa atribuible a la empresa, justo lo contrario de lo que el documento busca acreditar. Una renuncia sin causa no necesita fundamento de rescisión.

### 3. La duración de la jornada es el art. 25 fr. V, no la III

Los mensajes de error introducidos en la Fase 1 citaban *"Art. 25 fr. III LFT"* para exigir la captura de la jornada. La fr. III es *el servicio o servicios que deban prestarse*; **la duración de la jornada es la fr. V**. Corregido.

### 4. Citas a una ley abrogada

La cláusula de confidencialidad citaba los *"Arts. 82-86 y 213 de la Ley Federal de Protección a la Propiedad Industrial"*. Esos números corresponden a la **abrogada Ley de la Propiedad Industrial**, no a la LFPPI vigente. Se retiró la cita numérica y quedó una referencia genérica a la ley: **no la sustituí por otro número de artículo porque no pude verificarlo contra fuente oficial** (ver dudas pendientes).

---

## El bug de dinero: prima de antigüedad (P1-9)

De los dos errores posibles que la auditoría planteaba, **el que existía era el segundo**: no pagarla cuando procedía.

`calcFiniquito()` se usa tanto para renuncia como para rescisión justificada, y ambas compartían `hasAntig = completed >= 15 || tieneAntig`. El **art. 162 fr. III** exige los 15 años **sólo en la separación voluntaria**; en despido o rescisión la concede *"independientemente de la justificación o injustificación del despido"*, sin mínimo.

Una rescisión justificada Art. 47 con menos de 15 años pagaba **$0** de prima de antigüedad, salvo que alguien marcara a mano la casilla de "prima voluntaria" — un derecho de ley tratado como concesión opcional.

Verificado con el motor real: un trabajador con 5 años y salario de $15,000 mensuales pasó de recibir $0 a **$34,990.28**.

Detalle revelador: la UI ya asumía la regla correcta — la casilla de prima voluntaria sólo se muestra cuando el tipo de baja es `renuncia`. La función de cálculo nunca alcanzó esa distinción.

El tope de 2×SMG (art. 162 fr. II) sí estaba bien aplicado (`sdiCap = Math.min(sdi, 2 * smg)`), y ahora toma el salario mínimo de `vigencias.js` en vez de una constante caduca.

---

## Decisiones tomadas y su razón

**El recibo ya no cierra el asunto; el convenio sí.** La declaración del recibo decía que el trabajador *"no tiene reclamación adicional alguna"* y queda *"completamente liquidado"*. Eso es renuncia de derechos, nula por el art. 5º fr. XIII. Se reescribió como declaración de **pago** de los conceptos desglosados, con la frase expresa de que no constituye renuncia. El cierre con efecto de cosa juzgada se movió a donde la ley lo pone: el **Convenio de Terminación ratificado ante el Centro de Conciliación** (art. 33), que es un documento nuevo y **opcional**.

**El convenio redacta la cláusula PRIMERA según lo que realmente pasó.** No hay un texto único: `injustificada` → art. 50; `renuncia` → art. 53 fr. I (mutuo consentimiento, porque aquí ambas partes firman, a diferencia de la carta unilateral); `justificada` → art. 47 con la misma fracción ya notificada, más una aclaración de que el convenio no sustituye ni modifica esa causa. Falta el motivo o la fracción → no genera.

**La cláusula CUARTA limita la renuncia en vez de ampliarla.** Dice expresamente que el convenio comprende *únicamente* los conceptos de la cláusula SEGUNDA. Es lo contrario del reflejo habitual, y es justamente lo que hace que un Centro de Conciliación pueda aprobarlo: el art. 33 sólo permite aprobar convenios que no contengan renuncia de derechos.

**Las columnas nuevas del acta son NULLABLE.** Las actas ya generadas no tienen hora de cierre ni manifestación del trabajador, y `generateActaPDF()` debe poder regenerar su PDF (desde el perfil o desde el kit de defensa) sin **fabricar** datos que nunca se capturaron. La obligatoriedad vive en el formulario, no en la base. Verificado con un acta "vieja": genera sin excepciones y sin imprimir las secciones nuevas.

**La confidencialidad se acotó a 2 años, salvo secreto industrial.** No hay un plazo que la ley imponga; el criterio es que una obligación perpetua sobre *cualquier* información es inejecutable y arrastra consigo la validez de la parte que sí lo era. Sólo el secreto industrial que reúne los requisitos de la LFPPI conserva protección indefinida. Se agregaron excepciones expresas (dominio público, información previa, mandato de autoridad) y la salvaguarda de que no restringe el ejercicio de derechos laborales ni la denuncia de ilícitos.

**La movilidad se acotó a municipio o zona metropolitana.** El art. 25 fr. IV exige señalar *"el lugar o los lugares"* donde deba prestarse el trabajo; *"o en el lugar que EL PATRON designe"* no lo señala, lo deja indeterminado. Se eligió el criterio de zona + aviso previo de 3 días + gastos de traslado a cargo del patrón, y consentimiento expreso fuera de esa zona. **No es un plazo ni un radio que la ley fije**: es una delimitación razonable, susceptible de ajustarse.

**El dictamen del periodo a prueba no puede ser posterior a la notificación.** `generateNotificacionNoAcreditacionPrueba` rechaza generar si la fecha del dictamen es posterior a la de efectos. Un dictamen firmado después de notificar la terminación evidencia que la opinión de la Comisión se recabó para justificar una decisión ya tomada — es peor que no tenerla.

**La Comisión Mixta exige representantes de ambas partes.** El acta no genera si falta representación del patrón o de los trabajadores: una comisión integrada sólo por la empresa no es mixta, y su opinión no cumple lo que piden los arts. 39-A y 39-B.

**El art. 39-D se aplicó con dos niveles.** Pactar prueba **y** capacitación inicial simultáneamente se bloquea duro (es el supuesto literal del artículo). Un antecedente de prueba con la misma CURP sólo advierte con confirmación explícita, porque puede tratarse de una CURP mal capturada o de una corrección de registro.

**Renuncias masivas: se advierte, no se impide.** Más de 3 cartas de renuncia en la misma sesión piden confirmación. No se puede saber si una renuncia es genuina, pero sí señalar cuando el patrón de uso coincide con el de renuncias inducidas. Contador en `sessionStorage`: es una advertencia por sesión de trabajo, no un límite permanente.

---

## Lo que decidí NO hacer

**No conecté los tres generadores de la Comisión Mixta a la UI.** Existen y están probados, pero no hay pantalla desde la cual dispararlos. Conectarlos requiere una vista de seguimiento del periodo a prueba que pertenece al expediente (Fase 3), no a esta fase. **Hoy sólo son alcanzables desde código.**

**No agregué `lugar_exacto` a la tabla `actas`.** La migración de la Fase 2 lo pedía, pero la tabla ya tiene `lugar` con el mismo propósito. Duplicar la columna no aporta nada.

**No toqué la cesión de derechos de autor en contratos ya firmados.** El cambio aplica a documentos nuevos. Los contratos ya generados con la cláusula anterior siguen existiendo tal cual — ver la nota de impacto abajo.

**No sustituí el número de artículo de la LFPPI.** Ver duda pendiente 1.

---

## Impacto en documentos ya generados o firmados

Ningún cambio de esta fase altera documentos ya emitidos: todos los generadores producen el PDF en el momento de la descarga, no se almacenan versiones. Pero conviene saber que:

- **Contratos firmados antes de esta fase** contienen la cláusula de movilidad abierta, la cesión global de derechos de autor, la confidencialidad sin plazo y —según el tipo— la causal inventada de temporada o el SDI de comisionista mal calculado. Las cláusulas nulas no se vuelven válidas por estar firmadas, pero tampoco se corrigen solas: **si quieres regularizarlos, hay que reexpedirlos o firmar un convenio modificatorio.** Vale la pena revisar cuántos hay.
- **Recibos de finiquito/liquidación ya firmados** contienen la declaración de "no tener reclamación adicional alguna". Esa parte sería nula, pero el recibo sigue acreditando el pago que ampara: la nulidad alcanza a la renuncia, no al resto (art. 33, párrafo tercero).
- **Actas levantadas antes de esta fase** no tienen hora de cierre, manifestación del trabajador ni datos de identificación de los testigos. Se pueden regenerar sin problema, pero seguirán sin esos elementos porque nunca se capturaron.
- **El SDI de comisionistas** venía calculándose para el contrato con la redacción de 30 días. Si hay comisionistas dados de alta ante el IMSS con esa base, **conviene revisar con el contador si procede una corrección**: el cálculo real de cotización vive en `calcularSBC()`, no en el texto del contrato, pero la discrepancia entre lo pactado y lo cotizado es en sí misma un problema.

---

## Migraciones

| Archivo | Estado |
|---|---|
| `43_migration_actas_circunstanciada.sql` | **Aplicada** en producción (`xqbzxkujooarntawzsoc`) |

Sólo agrega columnas nullable a `actas`. Sin migración de datos históricos, sin cambios destructivos. La RLS de la tabla no se tocó (ya usaba `mi_empresa_id()` + `puede_gestionar()`).

Próximo número disponible: **44**.

---

## Verificación

Sin navegador ni flujo de login disponibles, cada cambio se verificó con `node --check` sobre los 41 archivos de `app/js/` y con scripts que sustituyen `window.jspdf.jsPDF` por un doble que registra las llamadas de dibujo, permitiendo aseverar sobre el texto realmente impreso.

| Escenario | Resultado |
|---|---|
| Recibo: liquidación 16.5 años / finiquito renuncia 3 años / finiquito rescisión 20 años | Sin excepciones; sin cita al art. 50; columna de período presente; nota ISR sólo cuando hay monto indemnizatorio real |
| Convenio: los 3 motivos | Generan sin frases prohibidas ("renuncia a toda acción", "finiquito total y absoluto") |
| Convenio: sin fracción del art. 47 / motivo inválido | Bloqueados con mensaje explicativo |
| Acta: registro anterior a la migración | Genera sin excepciones y sin imprimir las secciones nuevas |
| Acta: registro nuevo completo | Imprime manifestación, constancia de lectura con hora real y datos de ambos testigos |
| Prima de antigüedad: 5 casos (renuncia con/sin voluntaria, ≥15 años, justificada <15 y ≥15) | Sólo cambia el caso que debía cambiar; sin motivo → error |
| Carta de renuncia | Sin cita al art. 51, sin la frase de "no presión", con los espacios en blanco y la recomendación |
| Contratos: los 6 generadores (5 modernos + legado) | Ninguna cláusula retirada sobrevive; todas las redacciones nuevas presentes |
| Comisión Mixta: 10 escenarios | 3 caminos completos OK; 7 casos incompletos o incoherentes bloqueados |

---

## Dudas pendientes que requieren tu confirmación

1. **Artículo vigente de la LFPPI para secretos industriales.** Retiré la cita a los arts. 82-86 y 213 (ley abrogada) y no la sustituí porque no tengo la LFPPI vigente para verificar el número correcto. Hoy la cláusula dice "en términos de la legislación aplicable, incluida la Ley Federal de Protección a la Propiedad Industrial", sin número. **¿Quieres que consiga el texto vigente y cite el artículo exacto?**

2. **El plazo de 2 años de confidencialidad.** No lo impone ninguna ley; lo elegí como plazo razonable. Si tu criterio o el de tu abogado es otro (1 año, 3 años), es un cambio de una línea.

3. **La delimitación de movilidad "mismo municipio o zona metropolitana" + 8 días de aviso.** Mismo caso: es una delimitación razonable, no un mandato legal. Si prefieres un radio en kilómetros o una lista enumerada de sucursales, se ajusta.

4. **Convenio modificatorio para contratos ya firmados.** Las cláusulas nulas de contratos vigentes no se corrigen solas. ¿Quieres que la Fase 3 incluya un generador de convenio modificatorio para regularizarlos, o prefieres reexpedir los contratos?

5. **Sigue abierta de la Fase 1:** la exención de ISR para relaciones de menos de 6 meses actualmente concede un año completo de exención (`Math.max(aniosComputables, 1)`). Conviene confirmarlo con el contador.

---

## Entregables pendientes

Los **documentos de muestra en `/samples/`** siguen sin generarse, tanto de la Fase 1 como de esta. Requieren un navegador real (jsPDF depende del DOM); los stubs de prueba verifican el contenido pero no producen PDFs abribles. **Si quieres los ejemplares, el camino es abrir la app y descargar uno de cada tipo**, o que prepare una página HTML que los genere todos de una pasada.
