# Reporte de la Fase 3 — Compliance y expediente

Rama `claude/capital-humano-legal-audit-cf0c3c`. Ocho commits, dos archivos de
generadores nuevos, dos de pantallas, tres migraciones aplicadas en producción.

---

## Fuentes consultadas

Todo artículo citado en un documento firmable se leyó del texto oficial antes de
escribirlo. Ninguno se citó de memoria.

| Ley | Fuente | Última reforma |
|---|---|---|
| Ley Federal del Trabajo | PDF consolidado de la Cámara de Diputados | DOF 14-05-2026 |
| Ley Federal de Protección de Datos Personales en Posesión de los Particulares | PDF consolidado de la Cámara de Diputados | **DOF 14-11-2025** |
| Ley Federal de Protección a la Propiedad Industrial | PDF consolidado de la Cámara de Diputados | DOF 03-04-2026 |

Las dos últimas se descargaron en esta fase, con tu autorización, para cerrar
citas que en la Fase 2 se habían dejado genéricas por no poder verificarlas.

---

## Hallazgos remediados

| # | Hallazgo | Commit |
|---|---|---|
| P2-4 | Reglamento Interior de Trabajo, depósito y acuses | `a88702e` |
| P2-4 | Aviso de privacidad y consentimientos de datos personales | `e6a62a5` |
| P2-4 | Protocolo de violencia laboral y acta de investigación | `e4610c1` |
| P2-4 | NOM-035, comisiones mixtas y constancias de capacitación | `6f3f2e8` |
| P2-3 | Kit de defensa completo según el art. 804 + diagnóstico de huecos | `9207ae2` |
| P2-5 | Anexo de teletrabajo del Cap. XII Bis | `4c95ea1` |
| P2-6 | Nueve documentos operativos de alto valor probatorio | `930ce93` |
| — | Cierre de la cita de secreto industrial pendiente de la Fase 2 | `40016b6` |

---

## Errores en la auditoría que se corrigieron al verificar

La auditoría es buena, pero no es infalible. Cinco cosas no resistieron el
contraste con el texto oficial:

**1. "Art. 47 fr. XI Bis" para el acoso — esa fracción no existe.**
La auditoría la usaba como fundamento para rescindir por acoso. Los actos
inmorales y el hostigamiento o acoso sexual son la **fracción VIII**. Es el
mismo error que ya se había corregido en `FALTAS_CATALOG` durante la Fase 1, y
la auditoría lo repetía aquí. El protocolo cita la fr. VIII.

**2. El protocolo del art. 132 fr. XXXI se implementa "en acuerdo con los
trabajadores".** La auditoría lo describía como un documento del patrón. El
texto es literal: *"Implementar, en acuerdo con los trabajadores, un
protocolo…"*. El generador exige al menos un representante de las personas
trabajadoras, igual que el reglamento interior.

**3. No son dos comisiones mixtas, es una.** La auditoría pedía
`generateActaComisionSeguridadHigiene` y `generateActaComisionCapacitacion` como
si la de capacitación y la de productividad fueran distintas. Los arts. 153-E y
153-F reconocen una sola: la **Comisión Mixta de Capacitación, Adiestramiento y
Productividad**, que es exactamente la misma cuya opinión exige el art. 39-A
para el período de prueba. El acta lo dice y queda conectada con lo que se
construyó en la Fase 2.

**4. El despacho contable no es una transferencia de datos, es un encargado.**
La auditoría lo listaba entre las transferencias del aviso de privacidad. El
art. 3 fr. XII de la LFPDPPP define a la persona encargada como quien trata
datos *por cuenta del responsable*; el art. 35 aplica a *terceros distintos de
la persona encargada*. La distinción cambia el régimen: al encargado no se le
transfieren datos, y no requiere consentimiento.

**5. El art. 9 LFPDPPP ya no es el del consentimiento para datos sensibles.**
En la ley abrogada lo era. En la vigente, el consentimiento expreso y por
escrito para datos sensibles es el **art. 8**; el art. 9 enumera las excepciones
al consentimiento. Y la autoridad ya no es el INAI: el art. 3 fr. XV define a la
"Secretaría" como la **Secretaría Anticorrupción y Buen Gobierno**. Un aviso de
privacidad que siga nombrando al INAI se delata como plantilla vieja.

---

## Decisiones y por qué

**El RIT bloquea, pero avisa en vez de impedir.** El art. 425 es tajante: el
reglamento *"surtirá efectos a partir de la fecha de su depósito"*. Dos causales
de amonestación del sistema se fundan en él. La opción fácil era impedir el acta;
la correcta es advertir y dejar decidir: un acta sin reglamento depositado no es
nula, sólo pierde su fundamento normativo, y a veces el patrón necesita
levantarla de todos modos. Mismo criterio que se usó con la prescripción del
art. 517 fr. I en la Fase 1.

**Paridad sólo donde la ley la exige.** Los arts. 509 y 153-E describen sus
comisiones como compuestas *"por igual número"* de representantes. El art. 424
fr. I, para el reglamento, sólo dice *"comisión mixta"*. Los generadores de las
dos primeras rechazan comisiones desequilibradas; el del reglamento no. Inventar
un requisito que la ley no impone es tan malo como omitir uno que sí.

**Los biométricos no se afirman sensibles: se tratan como tales.** La lista del
art. 3 fr. VI LFPDPPP es *"enunciativa más no limitativa"* y no los nombra. El
aviso lo dice así y les da trato reforzado por prudencia, en vez de afirmar una
calificación que la ley no hace. Y el consentimiento advierte que negarse obliga
a habilitar un método alterno de registro: condicionar el empleo a la huella no
produce un consentimiento libre, y sin libertad no hay consentimiento.

**Una casilla por finalidad, no una firma al pie.** El art. 3 fr. IV define el
consentimiento como *"específica e informada"*. Una sola firma bajo una lista de
tratamientos no lo es. Cada finalidad sensible lleva su casilla SÍ/NO, y el
consentimiento de monitoreo se niega a emitirse sin declarar qué se monitorea.

**El registro del acuse se pide en un segundo paso.** Lo que acredita la entrega
es la firma, no la descarga. Registrar al descargar produciría un expediente que
dice tener acuses que nadie firmó — peor que no tener nada, porque da falsa
tranquilidad.

**El diagnóstico del art. 804 vale más que el ZIP.** El Kit ya armaba el
expediente; lo que faltaba era decir qué falta. El índice trae ahora una fila por
exigencia del art. 804, con el plazo de conservación aplicable y las filas
faltantes en rojo, más la advertencia del art. 805 —conservando su *"salvo prueba
en contrario"*—. Los huecos se pueden llenar antes del citatorio; ese aviso llega
a tiempo una sola vez.

**El convenio de modificación bloquea la baja de salario.** No advierte: rechaza.
El art. 51 fr. IV la convierte en causa de rescisión imputable al patrón, el
art. 56 impide condiciones inferiores a la ley y el art. 5º fr. XIII hace nula la
renuncia. Firmarla no la vuelve válida, sólo deja constancia escrita de la
reducción.

**El tope de 12 horas diarias no se advierte, se bloquea.** El art. 68, último
párrafo, dice *"en ningún caso"*. Ninguna autorización lo salva, así que el
generador se niega. En cambio el exceso sobre el tope semanal sí se advierte:
ahí la ley sí prevé una consecuencia —pago triple, art. 68 segundo párrafo—.

**La carta de no adeudo se expide a favor del trabajador, nunca al revés.** Una
carta donde el trabajador declare que nada se le debe sería una renuncia de
derechos, nula por el art. 5º fr. XIII. La que sirve es la que dice que la
empresa no le reclama nada.

---

## Lo que decidí NO hacer

**No inventé el formato DC-3.** Es un formato oficial de la STPS. La constancia
que se genera es la del art. 153-V —el documento con el que el trabajador
acredita haber llevado y aprobado un curso— y dice en su cuerpo que no sustituye
al DC-3 y que sirve de base para llenarlo. Hacerse pasar por el formato oficial
habría sido peor que no tenerlo.

**No enumeré las obligaciones que la NOM-035 escalona por número de personas.**
La norma diferencia según el tamaño del centro de trabajo. No tuve el texto de la
NOM a la vista, así que la política declara los compromisos sin afirmar qué
guía de referencia aplica a cada tramo. Es un hueco consciente, no un olvido.

**No agregué el porcentaje de teletrabajo como campo suelto.** Se guarda sólo si
la modalidad está marcada. Un porcentaje sin teletrabajo declarado no significa
nada y dispararía la alerta del art. 330-B sin razón.

**No toqué el aviso de privacidad público de la plataforma**
(`app/aviso-privacidad.html`). Es el de Capital Humano MX frente a sus usuarios,
no el del patrón frente a su personal: son documentos distintos con responsables
distintos. Sigue con los placeholders `[RAZÓN SOCIAL]`, `[DOMICILIO]` y
`[CORREO DE CONTACTO]` sin llenar, que es un pendiente aparte y anterior.

---

## Impacto en documentos ya generados o firmados

**Ninguno se invalida.** Todo lo de esta fase es aditivo: documentos que antes no
existían. No se modificó ningún generador de contratos, actas, avisos o recibos.

Dos matices que conviene tener presentes:

1. **Las actas ya levantadas que invocan el Reglamento Interior de Trabajo**
   siguen exactamente igual. Lo que cambió es que ahora el sistema lo advierte.
   Si tu RIT no está depositado, esas actas se apoyan sólo en las obligaciones
   que la LFT impone directamente al trabajador (arts. 134 y 135), no en el
   reglamento. No hay nada que corregir en los PDFs ya emitidos; sí conviene
   depositar el reglamento cuanto antes para las siguientes.

2. **Los acuses se registran sólo cuando tú lo confirmas.** No se dio de alta
   ningún acuse retroactivo. El sistema reporta como pendiente todo lo que no se
   haya registrado, aunque en la práctica se haya entregado. Si ya tienes
   entregas firmadas en papel, regístralas desde la pestaña Cumplimiento para que
   las alertas dejen de pedirlas.

---

## Migraciones aplicadas

| # | Archivo | Qué hace | Estado |
|---|---|---|---|
| 44 | `44_migration_cumplimiento.sql` | `empresas.rit_*`; tablas `acuses_documentos` y `capacitaciones`, con RLS | Aplicada y verificada |
| 45 | `45_alertas_cumplimiento.sql` | `generar_alertas_cumplimiento()`: RIT sin depositar, plazo vencido, acuses faltantes, aviso de privacidad | Aplicada y verificada |
| 46 | `46_migration_teletrabajo.sql` | `trabajadores.es_teletrabajo` y `pct_tiempo_remoto`; alerta de teletrabajo sin anexo | Aplicada y verificada |

Todas las columnas nuevas son NULLABLE o traen DEFAULT. Ningún registro
histórico cambió de valor ni quedó inválido. Las tres tablas nuevas llevan RLS
por `empresa_id` con escritura restringida a quien puede gestionar, siguiendo el
patrón de la migración 40.

Al aplicar la 45 sobre tus datos reales, la alerta salió correctamente en
crítica: hay un acta levantada y el reglamento no está depositado.

---

## Verificación

| Prueba | Aserciones | Resultado |
|---|---|---|
| Reglamento Interior de Trabajo | 27 | Todas pasan |
| Datos personales | 33 | Todas pasan |
| Protocolo de violencia laboral | 27 | Todas pasan |
| NOM-035 y comisiones mixtas | 36 | Todas pasan |
| Teletrabajo | 27 | Todas pasan |
| Documentos operativos | 77 | Todas pasan |
| Kit de defensa (diagnóstico 804) | 17 | Todas pasan |
| Contratos (Fase 2, sin regresión) | 17 | Todas pasan |
| Comisión Mixta (Fase 2, sin regresión) | 9 | Todas pasan |
| Acta circunstanciada (Fase 2, sin regresión) | 2 | Todas pasan |
| **Total** | **272** | **Sin fallas** |

`node --check` limpio en los 43 archivos de `app/js/`.

Las pruebas corren en un sandbox con un jsPDF falso que registra las llamadas a
`text()` y `autoTable()`. No sustituyen a abrir la aplicación en el navegador,
pero verifican lo que importa: que el texto legal correcto llegue al documento y
que los generadores se nieguen a emitir documentos inválidos.

---

## Preguntas abiertas

1. **NOM-035.** ¿Cuántas personas tiene el centro de trabajo más grande? La norma
   escalona las obligaciones (identificación de factores, evaluación del entorno,
   exámenes médicos) según el tamaño, y la política actual no lo precisa.

2. **Comisión Mixta de Capacitación.** El art. 153-E la obliga a partir de más de
   50 trabajadores. El art. 39-A pide su opinión para terminar en período de
   prueba **sin importar el tamaño**. Esa tensión no la resuelve la ley: en
   empresas chicas conviene constituirla aunque no sea obligatoria, y así lo dice
   el acta. Vale la pena confirmarlo con tu abogado.

3. **Descuentos.** Con un salario de $15,000 mensuales, el tope legal del
   descuento quincenal es de **$995.40** (30% del excedente del mínimo). Si hoy
   estás descontando préstamos por encima de eso, el generador los va a rechazar.
   Es correcto conforme al art. 110 fr. I, pero puede chocar con la práctica
   actual: conviene revisarlo antes de que aparezca en pantalla.

4. **Vía de denuncia del protocolo.** Se captura al generar cada constancia y no
   se guarda en la empresa, porque puede cambiar entre centros de trabajo. Si
   prefieres fijarla una sola vez, se agrega una columna y se elimina la
   pregunta.

5. Sigue abierta la de la Fase 2 sobre el **plazo de 2 años de
   confidencialidad**: es un número que elegí yo, no la ley.

---

## Lo que queda para la Fase 4

- Acentos y eñes: embeber una fuente TTF (P3-1). Es el único punto de todo el
  proyecto que necesita una dependencia nueva.
- Numeración ordinal de cláusulas (P3-2).
- Mover el disclaimer fuera del documento firmado (P3-3).
- Rúbrica marginal por página (P3-4).
- Hash SHA-256, sello de tiempo y trazabilidad (P2-7).
- Unificar `plantillas.js` con `pdfs.js` (P2-9) — hoy el texto de las cláusulas
  vive duplicado en dos archivos y hay que cambiarlo en ambos.

También sigue pendiente, de la Fase 2, decidir qué hacer con los **contratos ya
firmados** que contienen las cláusulas nulas corregidas: reexpedirlos o
regularizarlos con un convenio modificatorio. El generador de convenios que se
construyó en esta fase (`generateConvenioModificacionCondiciones`) sirve para lo
segundo.
