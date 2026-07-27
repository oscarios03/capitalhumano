/**
 * Capital Humano MX — Redacción jurídica compartida (P2-9)
 *
 * Hasta ahora `pdfs.js` (lo que realmente se firma) y `plantillas.js` (lo que
 * lee el Agente IA) tenían cada una su propia copia de las mismas cláusulas.
 * Divergían: dos ediciones de la misma cláusula, corregidas por separado en
 * la Fase 2, sin garantía de que la siguiente corrección tocara ambas. El
 * riesgo real era que el Agente IA le explicara al usuario una cláusula
 * distinta de la que el botón "Generar contrato" imprime.
 *
 * Este archivo es ahora la única fuente de la REDACCIÓN LITERAL de las
 * cláusulas que no dependen de configuración específica de la empresa
 * (fondo de ahorro, vales, festivos adicionales, etc. siguen siendo
 * condicionales y viven sólo en `pdfs.js`, porque su texto varía según datos
 * que no tiene sentido "compartir": no hay nada que unificar en una cláusula
 * que unas empresas tienen y otras no).
 *
 * Convención: los placeholders usan corchetes, igual que ya hacía
 * `plantillas.js` (`[DOMICILIO]`, `[FECHA_ANTIGUEDAD]`...). `pdfs.js` los
 * resuelve con `_sustituir()`; `plantillas.js` los deja tal cual, porque el
 * propio Agente IA los reemplaza con los datos del caso.
 *
 * Debe cargarse ANTES que `pdfs.js` y `plantillas.js`.
 */

const CLAUSULAS = {

  // ── Instrumentos y herramientas de trabajo ──────────────────────────────
  herramientas:
    `EL PATRON proporcionará a EL TRABAJADOR los equipos, herramientas e instrumentos necesarios para el desempeño de sus funciones, los cuales son de propiedad exclusiva de EL PATRON. EL TRABAJADOR se obliga a darles uso exclusivamente laboral y a devolverlos en buen estado al término de la relación, respondiendo por daños causados por dolo, negligencia o descuido.`,

  // ── Capacitación y adiestramiento (arts. 153-A a 153-X LFT) ─────────────
  capacitacion:
    `EL TRABAJADOR participará en los programas de capacitación y adiestramiento que EL PATRON determine, conforme a los artículos 153-A al 153-X de la Ley Federal del Trabajo, con la finalidad de actualizar y perfeccionar sus conocimientos. La capacitación recibida no genera derecho adicional de permanencia en la empresa.`,

  // ── Obligaciones del trabajador (art. 134 LFT) ───────────────────────────
  obligacionesTrabajador:
    `EL TRABAJADOR se obliga a: I) Ejecutar el trabajo con la intensidad y cuidado apropiados; II) Observar las medidas de higiene y seguridad; III) Guardar escrupulosamente los secretos técnicos y comerciales; IV) Observar buenas costumbres; V) Prestar auxilio en casos de siniestro; VI) Comunicar al PATRON las deficiencias que advierta; VII) Someterse a los reconocimientos médicos en los términos que establezca EL PATRON.`,

  // ── Deducciones de ley (art. 110 LFT) ────────────────────────────────────
  deducciones:
    `EL PATRON queda autorizado para realizar las deducciones al salario conforme al artículo 110 de la Ley Federal del Trabajo: I) Deudas por anticipos o artículos del PATRON; II) Cuotas IMSS e INFONAVIT; III) Pagos de créditos del INFONAVIT o del FOVISSSTE; IV) Descuentos autorizados por convenio escrito.`,

  // ── Confidencialidad y secretos industriales ─────────────────────────────
  // Verificado en la Fase 2/3: el deber de guardar los secretos técnicos y
  // comerciales lo impone directamente el art. 134 fracc. III LFT; sólo el
  // secreto industrial —el que reúne los requisitos del art. 163 fr. I
  // LFPPI— justifica protección indefinida. El art. 166 LFPPI se cita a
  // propósito: sólo obliga a quien "se le haya prevenido sobre su
  // confidencialidad", y firmar esta cláusula ES esa prevención.
  confidencialidad: [
    `EL TRABAJADOR guardará los secretos técnicos, comerciales y de fabricación de los que tenga conocimiento con motivo de su trabajo, en términos del artículo 134 fracción III de la Ley Federal del Trabajo. Por virtud de esta cláusula queda prevenido de la confidencialidad de dicha información para los efectos del artículo 166 de la Ley Federal de Protección a la Propiedad Industrial. Tratándose de secretos industriales que reúnan los requisitos del artículo 163 fracción I de esa misma Ley, esta obligación subsiste mientras la información conserve ese carácter. Respecto de la demás información reservada de la empresa (datos, procesos, metodologías, listados de clientes, estrategias comerciales y software), la obligación de confidencialidad subsistirá durante la relación de trabajo y por los DOS AÑOS siguientes a su terminación.`,
    `Esta obligación no comprende la información que sea o llegue a ser de dominio público sin intervención de EL TRABAJADOR, la que EL TRABAJADOR ya poseía lícitamente antes de la relación, ni la que deba revelar por mandato de autoridad competente. Tampoco restringe el ejercicio de los derechos laborales de EL TRABAJADOR ni la denuncia de hechos posiblemente ilícitos ante la autoridad.`,
    `La revelación indebida de dicha información puede generar responsabilidad civil, penal y administrativa en términos de la legislación aplicable, incluida la Ley Federal de Protección a la Propiedad Industrial.`,
  ],

  // ── Propiedad intelectual e invenciones (art. 163 LFT) ───────────────────
  propiedadIntelectual: [
    `Las obras y desarrollos que EL TRABAJADOR realice por encargo de EL PATRON, en el ejercicio de las funciones descritas en este contrato y con recursos de la empresa, se consideran obra por encargo y corresponden a EL PATRON en términos del artículo 83 de la Ley Federal del Derecho de Autor, quedando a salvo los derechos morales de EL TRABAJADOR, que son inalienables e irrenunciables.`,
    `Tratándose de invenciones, se estará a lo dispuesto por el artículo 163 de la Ley Federal del Trabajo: EL TRABAJADOR tendrá derecho a que su nombre figure como autor de la invención; cuando se dedique a trabajos de investigación o de perfeccionamiento de los procedimientos utilizados en la empresa por cuenta de ésta, la propiedad de la invención y el derecho a explotar la patente corresponderán a EL PATRON, e independientemente del salario percibido EL TRABAJADOR tendrá derecho a una compensación complementaria cuando la importancia de la invención y los beneficios que reporte a EL PATRON no guarden proporción con dicho salario. En cualquier otro caso la propiedad de la invención corresponderá a quien la realizó.`,
    `Las partes podrán celebrar un convenio anexo de propiedad intelectual para detallar el alcance de lo previsto en esta cláusula respecto de proyectos específicos, sin que dicho convenio pueda reducir los derechos que la ley reconoce a EL TRABAJADOR.`,
  ],

  // ── Causas de rescisión y aviso de renuncia ──────────────────────────────
  // El art. 110 LFT es limitativo: no autoriza descontar por falta de
  // preaviso. Se conserva como buena práctica, sin consecuencia económica.
  rescisionAviso:
    `Son causas de rescisión sin responsabilidad para EL PATRON las del artículo 47 de la Ley Federal del Trabajo; y sin responsabilidad para EL TRABAJADOR las del artículo 51 de la misma Ley. En caso de separación voluntaria, se solicita a EL TRABAJADOR dar aviso con quince días naturales de anticipación, a efecto de permitir la debida entrega-recepción de sus funciones.`,

  // ── Beneficiarios (art. 25 fracc. X LFT) ─────────────────────────────────
  beneficiariosIntro:
    `EL TRABAJADOR designa como beneficiarios para recibir el pago de salarios e indemnizaciones en caso de fallecimiento o desaparición, conforme al artículo 25 fracción X de la Ley Federal del Trabajo, a:`,
  // El art. 25 fr. X no autoriza al patrón a pagar directamente: el art. 503
  // somete el pago a un procedimiento especial ante el Tribunal, y sólo el
  // pago hecho en cumplimiento de esa resolución libera al patrón (fr. VII).
  beneficiariosAdvertencia:
    `Esta designación no faculta a EL PATRON para cubrir directamente las prestaciones e indemnizaciones pendientes al fallecimiento de EL TRABAJADOR. Conforme a los artículos 115 y 503 de la Ley Federal del Trabajo, los beneficiarios deberán acudir ante el Tribunal competente, que determinará mediante el procedimiento especial correspondiente quiénes tienen derecho a percibirlas; sólo el pago hecho en cumplimiento de dicha resolución libera a EL PATRON de responsabilidad.`,

  // ── Reconocimiento de antigüedad (art. 158 LFT) ──────────────────────────
  antiguedad:
    `Para efectos del cómputo de la antigüedad y las prestaciones derivadas, se toma como fecha de inicio de la relación laboral el día [FECHA_ANTIGUEDAD], de conformidad con el artículo 158 de la Ley Federal del Trabajo.`,

  // ── Trabajadores menores de edad (arts. 22-23 LFT) ───────────────────────
  menoresEdad:
    `En caso de que EL TRABAJADOR sea menor de 18 años, las partes declaran que se cumplen las disposiciones de los artículos 22 y 23 de la Ley Federal del Trabajo: autorización de padres o tutores, prohibición de trabajo nocturno industrial y jornada máxima de 6 horas diarias.`,

  // ── Ley aplicable y autoridad competente (art. 700 LFT) ──────────────────
  // El art. 700 fr. II deja la elección de competencia al trabajador; una
  // sumisión expresa con renuncia de fuero sería nula (art. 5 fr. XIII LFT).
  jurisdiccion:
    `Para la interpretación y cumplimiento del presente contrato, las partes estarán a lo dispuesto por la Ley Federal del Trabajo y se someterán a la autoridad laboral competente en términos del artículo 700 de dicho ordenamiento.`,

  // ── Supletoriedad ─────────────────────────────────────────────────────────
  supletoriedad:
    `En todo lo no previsto expresamente en el presente contrato se aplicará supletoriamente la Ley Federal del Trabajo vigente y demás disposiciones aplicables. Las condiciones más favorables para EL TRABAJADOR prevalecen sobre lo aquí estipulado.`,

  // ── Lugar de trabajo y movilidad (art. 25 fracc. IV LFT) ─────────────────
  // Acotado a reubicaciones dentro del mismo municipio o zona metropolitana,
  // con aviso previo y gastos de traslado a cargo del patrón; fuera de esa
  // zona requiere el consentimiento expreso del trabajador.
  lugarTrabajo:
    `EL TRABAJADOR prestará sus servicios en [DOMICILIO]. Si por necesidades del servicio EL PATRON requiere reubicarlo a otro centro de trabajo dentro del mismo municipio o zona metropolitana, se lo notificará con al menos tres días naturales de anticipación y cubrirá los gastos de traslado que se originen; el cambio no implicará modificación del salario ni de las demás condiciones de trabajo (Art. 25 fracción IV LFT). Cualquier reubicación fuera de dicha zona requerirá el consentimiento expreso de EL TRABAJADOR.`,

  // ── Suspensión entre temporadas (contrato por temporada) ─────────────────
  // Verificado: el Art. 42 Bis LFT NO regula el trabajo por temporada (es la
  // suspensión por contingencia sanitaria). La conclusión de temporada es
  // SUSPENSIÓN (art. 42 fr. VIII, duración fijada por el art. 43 fr. V), no
  // rescisión automática a los 15 días como asumía una versión anterior.
  temporadaSuspension:
    `SUSPENSIÓN Y CONVOCATORIA: EL PATRON convocará a EL TRABAJADOR con mínimo 30 días de anticipación al inicio de cada temporada. La inasistencia de EL TRABAJADOR al reinicio de labores no rescinde la relación de pleno derecho: se rige por las reglas ordinarias de rescisión (más de tres faltas de asistencia en un período de treinta días configuran la causal del artículo 47 fracción X de la Ley Federal del Trabajo), requiere su propio aviso de rescisión, y está sujeta al plazo de prescripción de un mes del artículo 517 fracción I de la misma Ley, contado desde que EL PATRON tuvo conocimiento de la falta.`,

  // ── SDI del comisionista (contrato por comisión) ──────────────────────────
  // El "promedio de los últimos 30 días" no es la regla del salario
  // variable: la Ley del Seguro Social la fija en el bimestre inmediato
  // anterior (art. 30 fr. II LSS), con avisos de modificación en meses
  // determinados.
  comisionSDI:
    `Para efectos del Instituto Mexicano del Seguro Social, tratándose de salario variable el salario diario integrado se determinará conforme al artículo 30 fracción II de la Ley del Seguro Social, con el promedio de las percepciones obtenidas en el bimestre inmediato anterior, presentando la modificación salarial correspondiente dentro de los primeros cinco días hábiles de enero, marzo, mayo, julio, septiembre y noviembre. El salario no será inferior al salario mínimo general vigente (Art. 85 LFT). El salario mensual base de referencia es $[SALARIO].00 M.N.`,
};

/**
 * Sustituye placeholders `[CLAVE]` por su valor. Usado por `pdfs.js` para
 * resolver los pocos textos de `CLAUSULAS` que llevan un dato variable
 * (fecha de antigüedad, domicilio, salario). `plantillas.js` no la usa: sus
 * corchetes los resuelve el propio Agente IA con los datos del caso.
 */
function _sustituir(texto, vars) {
  return Object.entries(vars).reduce(
    (s, [clave, valor]) => s.split(`[${clave}]`).join(valor),
    texto
  );
}
