/**
 * Capital Humano MX — Base de Conocimiento de Plantillas
 * Texto plano extraído de las plantillas oficiales de la empresa.
 * Estas plantillas son referencia para el Agente IA.
 *
 * Para reemplazar con el contenido real de los .docx, ejecuta:
 *   python3 extrae_docx.py NOMBRE_ARCHIVO.docx
 */

const PLANTILLAS = {

  // ──────────────────────────────────────────────────────────────────────────
  contrato_indeterminado: `
CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO INDETERMINADO

En la Ciudad de [CIUDAD], siendo el día [FECHA], comparecen por una parte
[RAZÓN SOCIAL], con RFC [RFC_PATRON], representada por [REPRESENTANTE], con
domicilio en [DOMICILIO], en adelante "EL PATRON"; y por la otra parte el C.
[NOMBRE_TRABAJADOR], con RFC [RFC_TRABAJADOR], CURP [CURP], NSS [NSS], en
adelante "EL TRABAJADOR", quienes celebran el presente Contrato Individual
de Trabajo al tenor de las siguientes declaraciones y cláusulas:

DECLARACIONES

I. Declara EL PATRON que es una empresa legalmente constituida, con actividad
   en [GIRO], con domicilio fiscal en [DOMICILIO_FISCAL].

II. Declara EL TRABAJADOR que tiene [EDAD] años de edad, estado civil
    [ESTADO_CIVIL], de nacionalidad [NACIONALIDAD], con domicilio en
    [DOMICILIO_TRABAJADOR], quien cuenta con los conocimientos y aptitudes
    necesarios para desempeñar el cargo de [PUESTO].

CLÁUSULAS

PRIMERA. DURACIÓN. El presente contrato es por TIEMPO INDETERMINADO, con
inicio el día [FECHA_INGRESO], en términos del artículo 35 de la Ley Federal
del Trabajo. La relación laboral únicamente podrá concluir por las causas
establecidas en los artículos 46 a 53 de la LFT.

SEGUNDA. PERÍODO DE PRUEBA. Conforme al artículo 39-A de la LFT, se establece
un período de prueba de [DIAS_PRUEBA] días naturales a partir del inicio de la
relación laboral, durante el cual EL PATRON evaluará si EL TRABAJADOR cumple
los requisitos y tiene las capacidades necesarias para el puesto. Transcurrido
dicho período sin notificación de rescisión, el contrato quedará ratificado.

TERCERA. OBJETO. EL TRABAJADOR se obliga a prestar sus servicios personales
y subordinados como [PUESTO], adscrito al área de [DEPARTAMENTO], realizando
las siguientes funciones: [FUNCIONES]. EL TRABAJADOR queda obligado a realizar
todas las actividades que le sean encomendadas por sus superiores jerárquicos
dentro de sus atribuciones.

CUARTA. SALARIO. EL PATRON pagará a EL TRABAJADOR un salario [PERIODO_SALARIO]
de $[SALARIO].00 M.N. ([SALARIO_LETRAS] PESOS 00/100 M.N.), que será cubierto
mediante [FORMA_PAGO], los días [DIAS_PAGO]. El salario se cubre en su
totalidad por la jornada ordinaria convenida, sin que en ningún caso sea
inferior al salario mínimo general vigente en la zona de que se trate.

QUINTA. LUGAR Y JORNADA. EL TRABAJADOR prestará sus servicios en [DOMICILIO_SUCURSAL]
o en el lugar que EL PATRON designe. La jornada ordinaria de trabajo será de
[HORA_INICIO] a [HORA_FIN] horas, con período de descanso para alimentos de
[DESCANSO_INICIO] a [DESCANSO_FIN] horas, los días [DIAS_SEMANA]. La jornada
semanal no excederá de 40 horas, conforme a la reforma publicada en el DOF.

SEXTA. DESCANSO SEMANAL. EL TRABAJADOR disfrutará de un día de descanso
semanal por cada seis de trabajo, preferentemente el [DIA_DESCANSO], con
goce de salario íntegro, en términos del artículo 69 de la LFT.

SÉPTIMA. PRESTACIONES DE LEY. EL TRABAJADOR tendrá derecho a:
a) Vacaciones conforme a la tabla del artículo 76 LFT (12 días el primer año,
   con incrementos bienales de 2 días hasta llegar a 20, y posteriormente 2 días
   por cada 5 años adicionales)[, más DIAS_VACACIONES_EXTRA días adicionales
   otorgados por EL PATRÓN si la empresa los tiene configurados];
b) Prima vacacional del [PRIMA_VACACIONAL]% sobre el salario ordinario de los
   días de vacaciones, conforme al artículo 80 LFT (mínimo 25%);
c) Aguinaldo equivalente a [DIAS_AGUINALDO] días de salario (mínimo de ley: 15),
   pagadero antes del 20 de diciembre de cada año (Art. 87 LFT);
d) Participación en las utilidades de la empresa (PTU) conforme al Art. 117 LFT;
e) Inscripción y aportaciones al Instituto Mexicano del Seguro Social (IMSS);
f) Aportaciones al Instituto del Fondo Nacional de la Vivienda para los
   Trabajadores (INFONAVIT);
g) Prima de antigüedad conforme al artículo 162 LFT.

SÉPTIMA BIS. PRESTACIONES ADICIONALES. [Incluir esta cláusula ÚNICAMENTE si la
empresa otorga prestaciones superiores a la ley, tomándolas de la configuración
de "Prestaciones y Disposiciones Particulares" de la empresa:]
a) Fondo de ahorro con aportación del [FONDO_PCT_TRABAJADOR]% a cargo de
   EL TRABAJADOR y [FONDO_PCT_PATRON]% a cargo de EL PATRÓN (Art. 110 fr. IV LFT);
b) Vales de despensa por [VALES_DESPENSA] por período de pago;
c) Prima dominical del [PRIMA_DOMINICAL]% (Art. 71 LFT);
d) Pago de horas extraordinarias a [FACTOR_HORAS_EXTRA] veces el salario por hora
   (Arts. 67-68 LFT);
e) Días de descanso adicionales con goce de sueldo: [FESTIVOS_EMPRESA].
Estas prestaciones no podrán ser inferiores a los mínimos de la LFT.

OCTAVA. INSTRUMENTOS DE TRABAJO. EL PATRON proporcionará a EL TRABAJADOR los
equipos, herramientas e instrumentos necesarios para el desempeño de sus funciones,
los cuales son de propiedad exclusiva de EL PATRON. EL TRABAJADOR se obliga a
darles uso exclusivamente laboral y a devolverlos en buen estado al término de
la relación, respondiendo por daños causados por dolo, negligencia o descuido.

NOVENA. CAPACITACIÓN Y ADIESTRAMIENTO. Las partes convienen que EL TRABAJADOR
participará en los programas de capacitación y adiestramiento que EL PATRON
determine, conforme a los artículos 153-A al 153-X de la LFT, con la finalidad
de actualizar sus conocimientos y elevar su productividad y nivel de vida.

DÉCIMA. OBLIGACIONES DEL TRABAJADOR. EL TRABAJADOR se compromete a cumplir
con las obligaciones establecidas en el artículo 134 de la LFT, entre ellas:
ejecutar el trabajo con la intensidad y cuidado apropiados; observar las medidas
de higiene y seguridad; guardar escrupulosamente los secretos técnicos y comerciales;
observar buenas costumbres; y acatar las instrucciones del PATRON en lo relativo
a la ejecución de su trabajo.

DÉCIMA PRIMERA. DEDUCCIONES DE LEY. EL PATRON queda autorizado para efectuar
a EL TRABAJADOR las deducciones señaladas en el artículo 110 de la LFT, incluyendo
cuotas al IMSS, aportaciones al INFONAVIT, créditos del INFONAVIT o del FOVISSSTE,
y demás descuentos autorizados por escrito por EL TRABAJADOR.

DÉCIMA SEGUNDA. CONFIDENCIALIDAD Y PROPIEDAD INTELECTUAL. EL TRABAJADOR se
obliga a guardar absoluta confidencialidad sobre toda la información, procesos,
metodologías, listados de clientes y secretos industriales o comerciales de EL
PATRON, durante la vigencia de este contrato y con posterioridad a su terminación.
La violación a esta cláusula podrá configurar los delitos de revelación de
secretos previstos en los artículos 210-211 del Código Penal Federal y los
artículos 82-86 y 213 de la Ley Federal de Protección a la Propiedad Industrial.
Todas las creaciones y desarrollos realizados con recursos del PATRON son de
titularidad exclusiva de éste, cediéndose en este acto los derechos patrimoniales
de autor que pudieran corresponder a EL TRABAJADOR.

DÉCIMA TERCERA. CAUSAS DE RESCISIÓN. Son causas de rescisión sin responsabilidad
para EL PATRON las establecidas en el artículo 47 de la LFT. Son causas sin
responsabilidad para EL TRABAJADOR las del artículo 51 LFT. En caso de separación
voluntaria, se solicita a EL TRABAJADOR dar aviso con quince días naturales de
anticipación, a efecto de permitir la debida entrega-recepción de sus funciones.

DÉCIMA CUARTA. BENEFICIARIOS. EL TRABAJADOR designa como beneficiarios para
recibir el pago de salarios e indemnizaciones en caso de fallecimiento o
desaparición, conforme al artículo 25 fracción X de la LFT, a:
Beneficiario 1: [BENEFICIARIO1_NOMBRE], [BENEFICIARIO1_PARENTESCO], Tel. [BENEFICIARIO1_TEL]
Beneficiario 2: [BENEFICIARIO2_NOMBRE], [BENEFICIARIO2_PARENTESCO], Tel. [BENEFICIARIO2_TEL]

DÉCIMA QUINTA. RECONOCIMIENTO DE ANTIGÜEDAD. Para el cómputo de la antigüedad
y las prestaciones derivadas, se toma como fecha de inicio el [FECHA_ANTIGUEDAD],
conforme al artículo 158 de la LFT.

DÉCIMA SEXTA. JURISDICCIÓN. Para la interpretación y cumplimiento del presente
contrato las partes se someten a la jurisdicción del Tribunal Laboral del Centro
de Justicia Laboral del Estado de Guanajuato, con sede en León, Guanajuato.

DÉCIMA SÉPTIMA. SUPLETORIEDAD. En todo lo no previsto en este contrato se
aplicará la Ley Federal del Trabajo vigente y demás disposiciones aplicables.

Se firma en dos tantos originales en la ciudad de [CIUDAD], el día [FECHA].

EL PATRON                           EL TRABAJADOR
[REPRESENTANTE]                     [NOMBRE_TRABAJADOR]
[RAZON_SOCIAL]                      RFC: [RFC_TRABAJADOR]

TESTIGO 1                           TESTIGO 2
_____________________               _____________________
`,

  // ──────────────────────────────────────────────────────────────────────────
  contrato_determinado: `
CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO DETERMINADO

En la Ciudad de [CIUDAD], siendo el día [FECHA], comparecen [RAZÓN SOCIAL]
(EL PATRON) y el C. [NOMBRE_TRABAJADOR] (EL TRABAJADOR), quienes celebran
el presente contrato al tenor de las siguientes cláusulas:

ADVERTENCIA LEGAL: El contrato por tiempo determinado sólo es válido cuando
lo exige la naturaleza del trabajo, cuando tiene por objeto sustituir
temporalmente a otro trabajador, o cuando lo imponga una circunstancia
objetiva y determinada (Art. 37 LFT). Su uso fuera de estos supuestos
convierte automáticamente la relación en tiempo indeterminado (Art. 39 LFT).

PRIMERA. DURACIÓN. El presente contrato es por TIEMPO DETERMINADO, con
vigencia del [FECHA_INICIO] al [FECHA_VENCIMIENTO]. La causa que justifica
el carácter determinado es: [MOTIVO_DETERMINADO], en términos del artículo
37 de la LFT. Al vencimiento del plazo la relación laboral concluirá
automáticamente sin responsabilidad para ninguna de las partes, salvo
renovación expresa por escrito.

SEGUNDA. OBJETO. EL TRABAJADOR prestará sus servicios como [PUESTO] en el
área de [DEPARTAMENTO], realizando: [FUNCIONES].

TERCERA. SALARIO. Salario [PERIODO] de $[SALARIO].00 M.N., mediante [FORMA_PAGO],
los días [DIAS_PAGO].

CUARTA. LUGAR Y JORNADA. Servicios en [DOMICILIO], jornada de [HORA_INICIO]
a [HORA_FIN] hrs., descanso [DESCANSO_INICIO]-[DESCANSO_FIN], días [DIAS_SEMANA].

QUINTA. DESCANSO. Un día de descanso semanal, preferentemente el [DIA_DESCANSO].

[CLÁUSULAS COMUNES: Prestaciones, Herramientas, Capacitación, Obligaciones,
Deducciones, Confidencialidad, Rescisión, Beneficiarios, Antigüedad, Jurisdicción]

Se firma en [CIUDAD] el día [FECHA].
`,

  // ──────────────────────────────────────────────────────────────────────────
  contrato_comision: `
CONTRATO INDIVIDUAL DE TRABAJO PARA TRABAJADOR COMISIONISTA

En [CIUDAD], siendo el [FECHA], celebran [RAZÓN SOCIAL] (EL PATRON) y el
C. [NOMBRE_TRABAJADOR] (EL TRABAJADOR COMISIONISTA), el presente contrato
conforme a los artículos 285 a 289 de la Ley Federal del Trabajo.

PRIMERA. DURACIÓN. El presente contrato es por TIEMPO INDETERMINADO, con
inicio el [FECHA_INICIO].

SEGUNDA. PERÍODO DE PRUEBA. Se establece un período de evaluación de [DIAS_PRUEBA]
días naturales para verificar el desempeño en ventas y cumplimiento de objetivos.

TERCERA. OBJETO Y ZONA. EL TRABAJADOR prestará sus servicios como [PUESTO],
con cobertura en la zona: [ZONA_ASIGNADA]. Sus actividades principales son:
[FUNCIONES]. Los días de presentación en oficina serán: [DIAS_PRESENTACION],
en el horario [HORARIO_PRESENTACION].

CUARTA. REMUNERACIÓN POR COMISIÓN. La remuneración se integrará por comisiones
conforme a la siguiente tabla:
[TABLA_COMISIONES]

Para efectos del IMSS e INFONAVIT, el SDI se calculará conforme al promedio
de comisiones percibidas en los últimos 30 días, con un mínimo equivalente al
salario mínimo general vigente (Art. 289 LFT). El salario mensual base de
referencia es $[SALARIO].00 M.N.

QUINTA. JORNADA. La jornada es autoadministrada dentro del horario de
[HORA_INICIO] a [HORA_FIN] hrs. EL TRABAJADOR se presentará en instalaciones
los días y horas indicados en la cláusula tercera.

SEXTA. DESCANSO. Un día semanal de descanso, preferentemente el [DIA_DESCANSO].

ANEXO A — FICHA DE DATOS PERSONALES Y DEL PUESTO
[DATOS_TRABAJADOR_COMPLETOS]

[CLÁUSULAS COMUNES: Prestaciones, Herramientas, Capacitación, Obligaciones,
Deducciones, Confidencialidad reforzada, Rescisión, Beneficiarios, Jurisdicción]

Se firma en [CIUDAD] el [FECHA], en dos tantos originales.
`,

  // ──────────────────────────────────────────────────────────────────────────
  contrato_obra: `
CONTRATO INDIVIDUAL DE TRABAJO POR OBRA O SERVICIO DETERMINADO

En [CIUDAD], siendo el [FECHA], celebran [RAZÓN SOCIAL] (EL PATRON) y
el C. [NOMBRE_TRABAJADOR] (EL TRABAJADOR), el presente contrato conforme
al artículo 36 de la Ley Federal del Trabajo.

NOTA LEGAL: Este contrato aplica exclusivamente cuando la naturaleza del trabajo
consiste en una obra o proyecto con inicio y fin determinados. Al término del
proyecto nacen prestaciones proporcionales al tiempo laborado.

PRIMERA. OBJETO Y DURACIÓN. El presente contrato se celebra para la realización
de la obra/proyecto: "[NOMBRE_PROYECTO]". La relación laboral inicia el
[FECHA_INICIO] y concluirá automáticamente al término de la obra, con fecha
estimada el [FECHA_FIN_PROYECTO]. Las funciones específicas del trabajador en
este proyecto son: [FUNCIONES_PROYECTO].

SEGUNDA. FUNCIONES ESPECÍFICAS. EL TRABAJADOR desempeñará el cargo de [PUESTO]
participando en el proyecto descrito: [DESCRIPCION_PROYECTO].
Fases del proyecto: [HITOS_PROYECTO].

TERCERA. SALARIO. Salario [PERIODO] de $[SALARIO].00 M.N., mediante [FORMA_PAGO].

CUARTA. LUGAR. EL TRABAJADOR prestará servicios en el lugar de ejecución de la
obra: [DOMICILIO_OBRA]. Podrá requerirse presencia en otros lugares que la obra
demande, con previo aviso.

QUINTA. JORNADA. Jornada de [HORA_INICIO] a [HORA_FIN] hrs., días [DIAS_SEMANA].

SEXTA. DESCANSO. Un día semanal de descanso, el [DIA_DESCANSO].

[CLÁUSULAS COMUNES: Prestaciones proporcionales, Herramientas, Capacitación,
Obligaciones, Deducciones, Confidencialidad especial por proyecto, Rescisión,
Beneficiarios, Jurisdicción]

Se firma en [CIUDAD] el [FECHA], en dos tantos originales.
`,

  // ──────────────────────────────────────────────────────────────────────────
  contrato_temporada: `
CONTRATO INDIVIDUAL DE TRABAJO POR TEMPORADA

En [CIUDAD], siendo el [FECHA], celebran [RAZÓN SOCIAL] (EL PATRON) y
el C. [NOMBRE_TRABAJADOR] (EL TRABAJADOR), el presente contrato conforme
al artículo 42 Bis de la Ley Federal del Trabajo.

PRIMERA. DURACIÓN Y CARÁCTER DISCONTINUO. El presente contrato es por TIEMPO
INDETERMINADO con prestación de servicios DISCONTINUA, en términos del artículo
42 Bis LFT. EL TRABAJADOR prestará servicios únicamente durante los períodos
de temporada. Fuera de ellos la relación queda SUSPENDIDA, no rescindida.

La naturaleza de temporada se justifica por: [NATURALEZA_TEMPORADA].

Las temporadas pactadas son:
[TABLA_TEMPORADAS]

SUSPENSIÓN Y CONVOCATORIA: EL PATRON convocará a EL TRABAJADOR con mínimo
30 días de anticipación al inicio de cada temporada. Si EL TRABAJADOR no se
presenta en los 15 días siguientes sin causa justificada, se entenderá rescindida
la relación sin responsabilidad para EL PATRON.

SEGUNDA. OBJETO. Durante cada temporada EL TRABAJADOR desempeñará el cargo de
[PUESTO] en el área de [DEPARTAMENTO], con las siguientes funciones: [FUNCIONES].

TERCERA. SALARIO. Salario [PERIODO] de $[SALARIO].00 M.N. durante temporada activa.
Las prestaciones se calculan proporcionalmente al tiempo efectivamente laborado.
[CONDICIONES_INACTIVIDAD]

CUARTA. LUGAR. Servicios en [DOMICILIO] o el lugar que EL PATRON determine por temporada.

QUINTA. JORNADA. Durante temporada activa: [HORA_INICIO] a [HORA_FIN] hrs., días [DIAS_SEMANA].

SEXTA. DESCANSO Y PRESTACIONES PROPORCIONALES. Un día semanal, el [DIA_DESCANSO].
Todas las prestaciones se calculan proporcional al tiempo laborado en cada año.

[CLÁUSULAS COMUNES: Prestaciones, Herramientas, Obligaciones, Deducciones,
Confidencialidad, Rescisión, Beneficiarios, Antigüedad acumulada, Jurisdicción]

Se firma en [CIUDAD] el [FECHA], en dos tantos originales.
`,

  // ──────────────────────────────────────────────────────────────────────────
  acta_amonestacion: `
ACTA DE AMONESTACIÓN

Folio: [FOLIO]
Lugar: [LUGAR], siendo las [HORA] del día [FECHA].

PARTES PRESENTES:
- EL PATRON: [RAZÓN SOCIAL], representado por [REPRESENTANTE]
- EL TRABAJADOR: [NOMBRE_TRABAJADOR], con cargo de [PUESTO]

DATOS DE LA FALTA:
Tipo de falta: [TIPO_FALTA]
Fecha de los hechos: [FECHA_HECHOS]
Lugar de los hechos: [LUGAR_HECHOS]
Causal legal: [CAUSAL_LEGAL]
Reincidencia: [ES_REINCIDENTE]

DESCRIPCIÓN DE LOS HECHOS:
[DESCRIPCION_HECHOS]

EVIDENCIA DISPONIBLE:
[EVIDENCIA]

ANTECEDENTES DISCIPLINARIOS:
[ANTECEDENTES]

Por medio del presente instrumento, [RAZÓN SOCIAL] hace constar la AMONESTACIÓN
formal al C. [NOMBRE_TRABAJADOR], apercibiéndole de que de reincidir en la
conducta descrita podrá ser sujeto de medidas disciplinarias más severas,
incluyendo la rescisión de la relación laboral sin responsabilidad para el patrón,
en términos del artículo 47 de la Ley Federal del Trabajo.

POSICIÓN DEL TRABAJADOR:
[REACCION_TRABAJADOR]

TESTIGOS:
[TESTIGO1_NOMBRE] — [TESTIGO1_PUESTO]
[TESTIGO2_NOMBRE] — [TESTIGO2_PUESTO]

Firman al calce en señal de conocimiento y [ACEPTACION]:

EL PATRON                    EL TRABAJADOR
________________             ________________

TESTIGO 1                    TESTIGO 2
________________             ________________
`,

  // ──────────────────────────────────────────────────────────────────────────
  acta_formal: `
ACTA ADMINISTRATIVA FORMAL CON APERCIBIMIENTO

Folio: [FOLIO]
Lugar: [LUGAR], siendo las [HORA] del día [FECHA].

PARTES PRESENTES:
- EL PATRON: [RAZÓN SOCIAL], representado por [REPRESENTANTE]
- EL TRABAJADOR: [NOMBRE_TRABAJADOR], cargo: [PUESTO], área: [DEPARTAMENTO]

I. DESCRIPCIÓN DETALLADA DE LOS HECHOS:
[DESCRIPCION_HECHOS]

II. IMPACTO DE LOS HECHOS:
[IMPACTO]

III. EVIDENCIA CON QUE SE CUENTA:
[EVIDENCIA]

IV. FUNDAMENTO LEGAL:
Los hechos descritos contravienen [CAUSAL_LEGAL], de conformidad con el
artículo [ARTICULO_LFT] de la Ley Federal del Trabajo.

V. ANTECEDENTES DISCIPLINARIOS:
[ANTECEDENTES]

Por medio del presente instrumento, [RAZÓN SOCIAL] levanta ACTA ADMINISTRATIVA
FORMAL al C. [NOMBRE_TRABAJADOR] por incurrir en la conducta antes descrita,
apercibiéndole que en caso de reincidencia en esta u otra falta, la empresa
podrá rescindir el contrato de trabajo SIN RESPONSABILIDAD PATRONAL, en
términos del artículo 47 de la LFT.

OBJETIVO DEL ACTA: [OBJETIVO]

POSICIÓN DEL TRABAJADOR:
[REACCION_TRABAJADOR]

TESTIGOS:
[TESTIGO1_NOMBRE] — [TESTIGO1_PUESTO]
[TESTIGO2_NOMBRE] — [TESTIGO2_PUESTO]

FIRMAS DE CONOCIMIENTO:

EL PATRON                    EL TRABAJADOR
________________             ________________

TESTIGO 1                    TESTIGO 2
________________             ________________
`,

  // ──────────────────────────────────────────────────────────────────────────
  acta_rescisoria: `
ACTA DE RESCISIÓN DE CONTRATO DE TRABAJO SIN RESPONSABILIDAD PATRONAL

Folio: [FOLIO]
Lugar: [LUGAR], siendo las [HORA] del día [FECHA].

COMPARECIENTES:
- EL PATRON: [RAZÓN SOCIAL], RFC [RFC_PATRON], representado por [REPRESENTANTE]
- EL TRABAJADOR: C. [NOMBRE_TRABAJADOR], RFC [RFC_TRABAJADOR], CURP [CURP],
  cargo: [PUESTO], departamento: [DEPARTAMENTO], con antigüedad desde [FECHA_INGRESO].

I. HECHOS QUE MOTIVAN LA RESCISIÓN:
[DESCRIPCION_HECHOS_DETALLADA]

II. CAUSAL DE RESCISIÓN:
Con fundamento en el artículo 47, [CAUSAL_ART47], de la Ley Federal del Trabajo,
[RAZÓN SOCIAL] rescinde la relación laboral con el C. [NOMBRE_TRABAJADOR] sin
responsabilidad para el patrón.

III. PROCESO DISCIPLINARIO PREVIO:
[PROCESO_PREVIO]

IV. EVIDENCIA:
[EVIDENCIA_DETALLADA]

V. ACUERDO ECONÓMICO:
[ACUERDO_ECONOMICO]

VI. POSICIÓN DEL TRABAJADOR:
[REACCION_TRABAJADOR]

NOTA: El trabajador se negó a firmar — Se hace constar ante la presencia de
los testigos que acuden al presente acto.

TESTIGOS PRESENCIALES:
[TESTIGO1_NOMBRE] — [TESTIGO1_PUESTO]
[TESTIGO2_NOMBRE] — [TESTIGO2_PUESTO]

EL PATRON                    EL TRABAJADOR
________________             ________________
[REPRESENTANTE]              [NOMBRE_TRABAJADOR]

TESTIGO 1                    TESTIGO 2
________________             ________________
`,

  // ──────────────────────────────────────────────────────────────────────────
  carta_renuncia: `
CARTA DE RENUNCIA VOLUNTARIA

[CIUDAD], a [FECHA]

[RAZÓN SOCIAL]
Attn.: [REPRESENTANTE]
[DOMICILIO_EMPRESA]
P  R  E  S  E  N  T  E

Por medio del presente escrito, yo [NOMBRE_TRABAJADOR], con RFC [RFC] y
CURP [CURP], quien he prestado mis servicios como [PUESTO] en el área de
[DEPARTAMENTO] desde el [FECHA_INGRESO], me permito comunicarle mi decisión
de presentar RENUNCIA VOLUNTARIA e irrevocable al cargo que venía desempeñando,
con efectos a partir del día [FECHA_BAJA].

[PARRAFO_MOTIVO_PERSONALIZADO]

[PARRAFO_AGRADECIMIENTO]

Manifiesto que no tengo adeudo alguno pendiente con la empresa por ningún concepto,
y quedo en espera del pago de las prestaciones proporcionales correspondientes
conforme a la Ley Federal del Trabajo.

[ACUERDOS_PENDIENTES]

Sin otro particular, quedo de usted.

Atentamente,

_____________________
[NOMBRE_TRABAJADOR]
RFC: [RFC]
CURP: [CURP]
NSS: [NSS]
`,

  // ──────────────────────────────────────────────────────────────────────────
  aviso_recision: `
AVISO DE TERMINACIÓN DE RELACIÓN LABORAL

[CIUDAD], a [FECHA]

C. [NOMBRE_TRABAJADOR]
Cargo: [PUESTO]
P  R  E  S  E  N  T  E

Por medio del presente, [RAZÓN SOCIAL], con RFC [RFC_PATRON], a través de su
Representante Legal [REPRESENTANTE], le comunica formalmente la TERMINACIÓN
DE SU RELACIÓN LABORAL, con efectos a partir del día [FECHA_BAJA].

TIPO DE TERMINACIÓN: [TIPO_TERMINACION]

CONTEXTO Y JUSTIFICACIÓN:
[CONTEXTO_ADICIONAL]

DATOS DE LA RELACIÓN LABORAL:
- Fecha de ingreso: [FECHA_INGRESO]
- Puesto: [PUESTO]
- Departamento: [DEPARTAMENTO]
- Salario al momento: $[SALARIO].00 M.N.
- Antigüedad: [ANTIGUEDAD]

PRESTACIONES Y LIQUIDACIÓN:
La empresa procede al pago de la [LIQUIDACION_O_FINIQUITO] que corresponda
conforme a la Ley Federal del Trabajo, cuyo desglose se detalla en el recibo
adjunto. [CONDICIONES_ESPECIALES]

ENTREGA DE BIENES Y DOCUMENTOS:
[ENTREGA_DOCUMENTOS]

Conforme a lo anterior, el Trabajador reconoce haber sido notificado de la
terminación de su relación laboral.

EL PATRON                    EL TRABAJADOR
________________             ________________
[REPRESENTANTE]              [NOMBRE_TRABAJADOR]
[RAZÓN SOCIAL]               RFC: [RFC_TRABAJADOR]

TESTIGO 1                    TESTIGO 2
________________             ________________
`,

};
