# Reporte de la Fase 4 — Presentación, integridad y unificación

Rama `claude/capital-humano-legal-audit-cf0c3c`. Seis commits (uno ya
reportado como parte del cierre de la Fase 3, cinco de esta ventana), una
fuente TTF embebida, una migración nueva.

---

## Hallazgos remediados

| # | Hallazgo | Commit |
|---|---|---|
| P2-9 | Unifica la redacción jurídica de `pdfs.js` y `plantillas.js` | `cc35767` |
| P3-1 | Embebe fuente Roboto y elimina `np()` por completo | `eb2a034` |
| P3-2 | Numeración ordinal de cláusulas en los contratos | `fe92324` |
| P3-3 | Quita el disclaimer del pie de los documentos firmados | `fe478d1` |
| P3-4 | Rúbrica marginal por página en documentos multipágina | `019668d` |
| P2-7 | Hash SHA-256 y trazabilidad de contratos generados | `6114bc1` |

---

## Qué cambió y por qué

**P2-9 — Unificar `plantillas.js` con `pdfs.js`.** El texto de las cláusulas
compartidas (confidencialidad, propiedad intelectual, deducciones,
beneficiarios, jurisdicción, supletoriedad...) vivía duplicado: una copia en
`pdfs.js` (lo que se firma) y otra en `plantillas.js` (la referencia que usa
el Agente IA). Corregir un fundamento legal en un lado y no en el otro es
exactamente el tipo de divergencia silenciosa que una auditoría no detecta
hasta que alguien compara los dos PDFs. `clausulas.js` es ahora la única
fuente: ambos archivos leen de ahí.

**P3-1 — Fuente y acentos.** Los PDFs usaban Helvetica, que jsPDF no sabe
codificar en Latin-1, así que todo el texto pasaba por `np()`, una función
que quitaba acentos y la ñ antes de imprimir. Un contrato de trabajo sin
"artículo", "días" o "señalado" no es un documento serio y puede restarle
peso probatorio ante una Junta. Se embebió Roboto (Apache 2.0, verificada
byte a byte para asegurar cobertura Latin-1) y se eliminó `np()` por
completo — no sólo se neutralizó, se quitaron sus ~700 sitios de llamada.
Como buena parte del texto se había escrito directamente sin acentos
(porque `np()` lo hacía moot), se aplicó además una pasada de corrección
ortográfica con un escáner que sólo toca contenido de cadena/plantilla,
nunca código, y que protege explícitamente los valores de enumeración
usados en comparaciones (`tipo === 'capacitacion'` no se acentúa).

**P3-2 — Numeración ordinal.** Los 5 contratos modernos numeraban sus
cláusulas "CLAUSULA 7a" — un numeral arábigo con una "a" pegada, ajeno a la
convención notarial mexicana que ya seguían los convenios, el RIT y
`plantillas.js` ("DÉCIMA PRIMERA", "DÉCIMA SEGUNDA BIS"...). Ahora los 5
imprimen "CLÁUSULA PRIMERA"..."CLÁUSULA VIGÉSIMA", calculado dinámicamente
para respetar el corrimiento cuando la cláusula de prestaciones adicionales
es condicional.

**P3-3 — Disclaimer fuera del documento firmado.** El pie decía "Referencial,
no sustituye asesoria legal" en el mismo documento que el trabajador firma y
que puede acabar como prueba ante una Junta. Un finiquito no es
"referencial": es lo que las partes reconocieron. La advertencia sigue viva
donde corresponde — `terminos.html` §3, que el usuario acepta al darse de
alta — y el pie del documento pasa a ser Folio · Página N de T · Razón
social. De paso se corrigió un bug real: varios generadores imprimían
"Capital Humano MX" (la marca del SaaS) donde debía ir la razón social de la
empresa cliente.

**P3-4 — Rúbrica marginal.** Un documento de varias hojas donde sólo la
última lleva firma es fácil de impugnar alegando que una hoja intermedia se
sustituyó después. Cada página que no es la última ahora lleva una línea en
blanco "Rúbrica PATRON" / "Rúbrica TRABAJADOR" al margen. Esto obligó a
subir el margen inferior reservado de 16 a 20 mm en el guardia compartido de
salto de página (`_checkY`), para que la rúbrica no se encimara con el
cuerpo del documento.

**P2-7 — Hash y trazabilidad.** Se creó `documentos_generados` (migración
47): folio, hash SHA-256, quién y cuándo, y un snapshot de los parámetros.
El hash se calcula con `crypto.subtle.digest` sobre el PDF ya renderizado
**antes** de estampar el pie — un hash no puede incluirse a sí mismo — y
luego se reescribe el pie con los primeros 8 caracteres. Esta pasada conecta
el mecanismo completo (hash → pie → registro en Supabase → descarga) sólo en
los 5 generadores de contrato, decisión tomada explícitamente con el
usuario para acotar el riesgo de convertir ~15 generadores síncronos en 6
archivos de una sola vez. El resto queda documentado como pendiente, no
oculto — ver abajo.

**Importante — lo que el hash NO es.** La migración deja el punto por
escrito: esto no es un sello de tiempo NOM-151-SCFI-2016. Esa norma exige
que el hash y la marca de tiempo los emita un Prestador de Servicios de
Certificación acreditado ante la Secretaría de Economía, un tercero de
confianza cuyo sello es oponible porque no lo controla quien generó el
documento. Este registro lo firma la propia aplicación: sirve para detectar
alteraciones y armar un expediente ordenado, pero no tiene el valor
probatorio reforzado de un sello NOM-151. Integrar un PSC queda como mejora
futura explícita; por eso el PDF y la UI hablan de "hash", nunca de
"sellado" o "timbrado".

---

## Un hallazgo de la propia suite de pruebas

Al verificar P2-7 aparecieron dos huecos preexistentes, ninguno causado por
esta fase: `test_recibo.js` y `test_convenio.js` llamaban a
`calcFiniquito()` sin el parámetro `motivo` que la fase 2.5 exige desde hace
tiempo (Art. 162 fr. III LFT). Los dos scripts tronaban con una excepción no
capturada — pero mi barrido de regresión de las fases anteriores nunca lo
detectó porque buscaba la palabra "ERROR:" en mayúsculas y el mensaje real
empieza "Error:" (sólo la E inicial mayúscula). Se corrigieron ambos scripts
y, de paso, el barrido de esta fase usa una búsqueda insensible a mayúsculas
y revisa el código de salida del proceso, no sólo el texto impreso.

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
| Unificación `plantillas.js` / `pdfs.js` | 49 | Todas pasan |
| Paridad literal PDF ↔ plantilla del agente | 16 | Todas pasan |
| Tokenizador de `np()` (unitarias) | 24 | Todas pasan |
| Tokenizador de acentos (unitarias) | 8 | Todas pasan |
| 5 contratos + legado (clausulado, ordinal, sin excepciones) | — | Sin fallas |
| Comisión Mixta, Acta, Convenio, Recibo (sin regresión) | — | Sin fallas |
| **Total con aserción numerada** | **341** | **Sin fallas** |

`node --check` limpio en los 47 archivos de `app/js/`. Cero ocurrencias de
`'helvetica'` y cero llamadas funcionales a `np()` en todo el código (sólo
queda una mención histórica en un comentario de `fuente_roboto.js`).
Renderizando un contrato completo de punta a punta: la secuencia de
cláusulas sale PRIMERA→VIGÉSIMA, el pie de sus 5 páginas queda "Folio
CONT-... | Hash 409dcd2d | Página N de 5 | ACME SA DE CV", la rúbrica
aparece 2 veces en cada una de las primeras 4 páginas y 0 en la última, y el
registro insertado en `documentos_generados` trae un `hash_sha256` de 64
caracteres hexadecimales cuyo prefijo coincide con el impreso en el PDF.

Las pruebas corren en un sandbox con un jsPDF falso que registra las
llamadas a `text()`/`autoTable()`, más un `crypto.subtle` real (Node lo trae
nativo) y un cliente de Supabase falso que captura los `insert()`. No
sustituyen a abrir la aplicación en el navegador y generar un PDF real.

---

## Pendiente

1. **Aplicar la migración 47** (`documentos_generados`) al proyecto de
   Supabase en vivo. No se aplicó automáticamente desde este entorno —sigue
   el mismo patrón que las migraciones 21, 38 y 39, que quedaron como
   archivo hasta que se aplicaron a propósito.
2. **Conectar el hash al resto de los generadores.** Recibos, actas, avisos,
   convenios, RIT, protocolo, NOM-035, teletrabajo, kit de defensa y
   resguardos ya comparten `_footerFolio`/`_hashDocumento`/
   `_registrarDocumentoGenerado` — conectarlos es repetir el patrón que
   `_cerrarContrato` ya prueba en los 5 contratos, no diseñar uno nuevo.
3. **Sello de tiempo NOM-151-SCFI-2016**, vía un Prestador de Servicios de
   Certificación acreditado — fuera de alcance de esta fase, documentado en
   la migración 47.
4. Sigue abierta la pregunta de la Fase 2/3 sobre el **plazo de 2 años de
   confidencialidad** (número elegido por mí, no por la ley) y qué hacer con
   los **contratos ya firmados** que contenían las cláusulas nulas
   corregidas en la Fase 2.

---

## Regresión manual sugerida antes de usar en producción

Con las 341 aserciones automatizadas en verde, falta lo que sólo se ve
abriendo la aplicación:

- [ ] Alta de un trabajador nuevo, de principio a fin.
- [ ] Generar los 5 tipos de contrato y confirmar visualmente: acentos y ñ
      correctos, numeración CLÁUSULA PRIMERA...VIGÉSIMA, sin el disclaimer
      viejo en el pie, rúbrica marginal en las páginas intermedias, y el
      hash en el pie coincidiendo con el que quedó en `documentos_generados`
      (una vez aplicada la migración 47).
- [ ] Flujo completo de baja (renuncia y rescisión), con su recibo de
      finiquito/liquidación.
- [ ] Kit de defensa: descarga del ZIP completo con el índice y el
      diagnóstico del art. 804.
- [ ] Un ciclo de nómina, incluyendo el recibo individual.
