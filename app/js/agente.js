/**
 * Capital Humano MX — Agente IA de Documentos Laborales
 * Requiere: config.js (SUPABASE_URL, SUPABASE_ANON_KEY), plantillas.js, pdfs.js
 */

// ═══════════════════════════════════════════════════════════════════════════
//  SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT_LABORAL = `Eres un experto en derecho laboral mexicano con más de 20 años de experiencia redactando contratos, actas administrativas y documentos laborales conforme a la Ley Federal del Trabajo vigente y sus reformas más recientes.

Tu tarea es generar documentos laborales PERSONALIZADOS y ESPECÍFICOS para cada caso, basándote en las plantillas oficiales de la empresa pero adaptando el contenido al contexto particular descrito.

REGLAS OBLIGATORIAS:
1. Usa lenguaje jurídico formal mexicano en todo momento
2. Cita SIEMPRE los artículos específicos de la LFT que apliquen al caso concreto
3. Personaliza CADA cláusula con los datos reales — NUNCA dejes placeholders como [DATO] sin resolver
4. Si el caso presenta riesgos legales, incorpora las salvaguardas en el texto e indícalos en advertencia_legal
5. Mantén la estructura de la plantilla base pero adapta contenido, extensión y énfasis al caso
6. Para actas rescisoriassé muy preciso en la causal del Art. 47 LFT que aplica
7. Responde ÚNICAMENTE con el JSON solicitado, sin texto adicional ni bloques markdown

FORMATO DE RESPUESTA — JSON estricto:
{
  "tipo": "string",
  "titulo": "string — título completo del documento",
  "folio": "string — folio sugerido ej. CTI-2026-001",
  "advertencia_legal": "string o null",
  "secciones": [
    {
      "tipo": "declaracion | clausula | cierre | firma",
      "numero": "string — ej. PRIMERA, II, 1",
      "titulo": "string",
      "contenido": "string — texto completo sin placeholders sin resolver"
    }
  ],
  "notas_agente": "string — observaciones sobre decisiones tomadas o aspectos a revisar"
}`;

// ═══════════════════════════════════════════════════════════════════════════
//  CATÁLOGO DE TIPOS DE DOCUMENTO
// ═══════════════════════════════════════════════════════════════════════════
const TIPOS_DOCUMENTO = {
  contrato_indeterminado: { label:'Contrato Tiempo Indeterminado', plantilla:'contrato_indeterminado', icono:'', categoria:'contrato',   desc:'Art. 35 LFT — Relación de planta sin fecha de término' },
  contrato_determinado:   { label:'Contrato Tiempo Determinado',   plantilla:'contrato_determinado',   icono:'', categoria:'contrato',   desc:'Art. 37 LFT — Período a prueba (30 o 90 días)' },
  contrato_obra:          { label:'Contrato por Obra o Proyecto',  plantilla:'contrato_obra',          icono:'', categoria:'contrato',   desc:'Art. 36 LFT — Para proyectos con fin determinado' },
  contrato_temporada:     { label:'Contrato por Temporada',        plantilla:'contrato_temporada',     icono:'', categoria:'contrato',   desc:'Arts. 35 y 42 fr. VIII LFT — Prestación discontinua' },
  contrato_comision:      { label:'Contrato por Comisión',         plantilla:'contrato_comision',      icono:'', categoria:'contrato',   desc:'Arts. 285-289 LFT — Trabajador comisionista' },
  acta_amonestacion:      { label:'Acta de Amonestación',         plantilla:'acta_amonestacion',      icono:'', categoria:'acta',       desc:'Primer aviso disciplinario, sin consecuencia inmediata' },
  acta_formal:            { label:'Acta Administrativa Formal',    plantilla:'acta_formal',            icono:'', categoria:'acta',       desc:'Apercibimiento formal con riesgo de rescisión' },
  acta_rescisoria:        { label:'Acta Rescisoria (Art. 47 LFT)',plantilla:'acta_rescisoria',        icono:'', categoria:'acta',       desc:'Terminación sin responsabilidad patronal' },
  carta_renuncia:         { label:'Carta de Renuncia',             plantilla:'carta_renuncia',         icono:'', categoria:'terminacion',desc:'Renuncia voluntaria e irrevocable del trabajador' },
  aviso_recision:         { label:'Aviso de Rescisión / Terminación',plantilla:'aviso_recision',     icono:'', categoria:'terminacion',desc:'Notificación formal de terminación patronal' },
};

// ═══════════════════════════════════════════════════════════════════════════
//  PREGUNTAS DE CONTEXTO POR TIPO
// ═══════════════════════════════════════════════════════════════════════════
const PREGUNTAS_CONTEXTO = {
  contrato_indeterminado: [
    { id:'situacion_especial',     tipo:'textarea', required:false, label:'¿Hay alguna situación especial en esta contratación?',   placeholder:'Ej: Viene de empresa del grupo con antigüedad reconocida / Tiene bono por objetivos adicional / Requiere cláusula de no competencia...' },
    { id:'condiciones_adicionales',tipo:'textarea', required:false, label:'Condiciones adicionales pactadas',                       placeholder:'Ej: Vales de despensa $1,500 / Auto de empresa / Seguro GMM...' },
    { id:'restricciones_especiales',tipo:'textarea',required:false, label:'Restricciones o acuerdos especiales',                   placeholder:'Ej: No competencia zona norte 1 año / Confidencialidad reforzada...' },
  ],
  contrato_determinado: [
    { id:'motivo_determinado',     tipo:'textarea', required:true,  label:'¿Por qué se celebra por tiempo determinado? (justificación legal obligatoria)', placeholder:'Ej: Sustitución temporal por incapacidad maternidad / Incremento estacional de producción...' },
    { id:'condiciones_adicionales',tipo:'textarea', required:false, label:'Condiciones adicionales pactadas',                       placeholder:'Beneficios extra, acuerdos especiales...' },
  ],
  contrato_obra: [
    { id:'descripcion_proyecto',   tipo:'textarea', required:true,  label:'Descripción detallada del proyecto u obra',             placeholder:'Nombre, alcance, entregables, cliente final...' },
    { id:'hitos_proyecto',         tipo:'textarea', required:false, label:'Hitos o fases del proyecto',                           placeholder:'Ej: Fase 1 — Diseño (30d) / Fase 2 — Desarrollo (90d)...' },
    { id:'condiciones_especiales', tipo:'textarea', required:false, label:'Condiciones especiales de este proyecto',               placeholder:'Ej: Viáticos incluidos / Certificaciones requeridas...' },
  ],
  contrato_temporada: [
    { id:'naturaleza_temporada',   tipo:'textarea', required:true,  label:'¿Por qué la actividad es de temporada? Describe el ciclo del negocio', placeholder:'Ej: Empresa de turismo con alta en verano y Semana Santa...' },
    { id:'condiciones_inactividad',tipo:'textarea', required:false, label:'Condiciones durante los períodos de inactividad',       placeholder:'Ej: El trabajador puede laborar en otras empresas / Hay pago de retención mínimo...' },
  ],
  contrato_comision: [
    { id:'descripcion_esquema',    tipo:'textarea', required:true,  label:'Describe el esquema de comisiones con detalle',         placeholder:'Ej: $50 por contrato cerrado, techo $8,000 / 8% de cobranza recuperada...' },
    { id:'territorio',             tipo:'text',     required:false, label:'Territorio o zona de ventas',                           placeholder:'Ej: Municipios de León, Silao y San Francisco del Rincón, Gto.' },
    { id:'condiciones_especiales', tipo:'textarea', required:false, label:'Condiciones especiales del esquema',                   placeholder:'Ej: Cartera asignada / Cuota mínima / Se proporcionan prospectos...' },
  ],
  acta_amonestacion: [
    { id:'descripcion_hechos',     tipo:'textarea', required:true,  label:'Describe con detalle lo que ocurrió',                  placeholder:'Fecha, hora, lugar, qué hizo o dejó de hacer, quién lo detectó...' },
    { id:'evidencia',              tipo:'textarea', required:false, label:'Evidencia disponible',                                 placeholder:'Ej: Registro asistencia / Correo / Reporte supervisor / Video...' },
    { id:'antecedentes',           tipo:'textarea', required:false, label:'Antecedentes disciplinarios previos',                  placeholder:'Ej: Primer incidente / Ya tiene acta del 15/03/2025...' },
    { id:'reaccion_trabajador',    tipo:'select',   required:true,  label:'Reacción del trabajador',                             opciones:['Acepta los hechos y firma','No acepta pero firma','Se negó a firmar'] },
  ],
  acta_formal: [
    { id:'descripcion_hechos',     tipo:'textarea', required:true,  label:'Describe con detalle lo que ocurrió',                  placeholder:'Fecha, hora, lugar, qué hizo, impacto en la empresa...' },
    { id:'evidencia',              tipo:'textarea', required:false, label:'Evidencia disponible',                                 placeholder:'Correos, reportes, testigos, registros de sistema...' },
    { id:'impacto',                tipo:'textarea', required:false, label:'¿Cuál fue el impacto para la empresa?',               placeholder:'Ej: Pérdida económica de $X / Daño a cliente / Incumplimiento...' },
    { id:'antecedentes',           tipo:'textarea', required:false, label:'Antecedentes disciplinarios previos',                  placeholder:'Folio y fecha de actas anteriores...' },
    { id:'objetivo',               tipo:'select',   required:true,  label:'¿Cuál es el objetivo del acta?',                     opciones:['Apercibir y documentar','Construir expediente para posible rescisión','Corregir conducta con advertencia formal'] },
    { id:'reaccion_trabajador',    tipo:'select',   required:true,  label:'Reacción del trabajador',                             opciones:['Acepta los hechos y firma','No acepta pero firma','Se negó a firmar'] },
  ],
  acta_rescisoria: [
    { id:'descripcion_hechos',     tipo:'textarea', required:true,  label:'Describe con detalle los hechos que motivan la rescisión', placeholder:'Qué ocurrió, cuándo, dónde, cómo, quiénes presentes, evidencia...' },
    { id:'causal_art47',           tipo:'select',   required:true,  label:'Causal del Art. 47 LFT que aplica',                  opciones:['Fracc. I — Engaño o documentos falsos al contratar','Fracc. II — Deshonestidad / Fraude','Fracc. III — Violencia / Agresión','Fracc. IV — Daño intencional a bienes','Fracc. V — Daño grave por negligencia','Fracc. VI — Comprometer la seguridad','Fracc. VII — Revelar secretos industriales','Fracc. VIII — Embriaguez / Drogas en el trabajo','Fracc. IX — Sentencia condenatoria','Fracc. X — Más de 3 faltas injustificadas en 30 días','Fracc. XI — Desobedecer al patrón','Fracc. XI Bis — Acoso laboral o sexual','Múltiples causales (especificar)'] },
    { id:'proceso_previo',         tipo:'textarea', required:false, label:'Proceso disciplinario previo',                        placeholder:'Ej: 2 actas formales previas (folios y fechas) / Primera vez pero gravedad lo justifica...' },
    { id:'evidencia',              tipo:'textarea', required:true,  label:'Evidencia con que se cuenta',                        placeholder:'Video de cámara, correos, declaración de testigos, auditoría...' },
    { id:'reaccion_trabajador',    tipo:'select',   required:true,  label:'Reacción del trabajador',                            opciones:['Acepta los hechos y firma','No acepta pero firma','Se negó a firmar'] },
    { id:'acuerdo_economico',      tipo:'textarea', required:false, label:'¿Hay algún acuerdo económico adicional?',            placeholder:'Ej: Se pagará finiquito aunque no corresponde / Negociación en curso...' },
  ],
  carta_renuncia: [
    { id:'motivo_renuncia',        tipo:'textarea', required:false, label:'Motivo de la renuncia (para personalizar el tono)',   placeholder:'Ej: Oportunidad en otra empresa / Motivos personales / Reubicación...' },
    { id:'relacion_empresa',       tipo:'select',   required:false, label:'¿Cómo fue la relación laboral?',                    opciones:['Excelente — carta con agradecimiento cálido','Buena — carta formal estándar','Tensa — carta escueta y estrictamente legal'] },
    { id:'acuerdos_pendientes',    tipo:'textarea', required:false, label:'Acuerdos pendientes que deben quedar en la carta',   placeholder:'Ej: Período de transición de 15 días / Bonos pendientes...' },
  ],
  aviso_recision: [
    { id:'motivo_terminacion',     tipo:'select',   required:true,  label:'Tipo de terminación',                               opciones:['Despido injustificado — Art. 49-50 LFT','Cierre de empresa / área','Reestructuración organizacional','Mutuo acuerdo entre las partes','Fuerza mayor'] },
    { id:'contexto_adicional',     tipo:'textarea', required:false, label:'Contexto adicional',                                placeholder:'Ej: Se cierra la sucursal / Hay acuerdo previo negociado...' },
    { id:'condiciones_especiales', tipo:'textarea', required:false, label:'Condiciones especiales del finiquito',              placeholder:'Ej: Quincena adicional voluntaria / Deuda del trabajador a descontar...' },
    { id:'entrega_documentos',     tipo:'textarea', required:false, label:'Documentos y bienes que debe entregar',             placeholder:'Ej: Laptop, credencial, accesos a sistemas, cartera de clientes...' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
//  FUNCIÓN PRINCIPAL — LLAMADA AL AGENTE
// ═══════════════════════════════════════════════════════════════════════════
async function generarDocumentoIA(tipoDocumento, trabajadorId, contexto) {
  const _sb = window.supabase;

  // 1. Cargar datos desde Supabase
  const { data: { user } } = await _sb.auth.getUser();
  const [{ data: trab }, { data: perfil }] = await Promise.all([
    _sb.from('trabajadores').select('*, sucursales(*)').eq('id', trabajadorId).single(),
    _sb.from('perfiles').select('empresa_id').eq('id', user.id).single(),
  ]);
  const { data: empresa } = await _sb.from('empresas').select('*').eq('id', perfil.empresa_id).single();

  // 2. Construir objeto de datos del caso
  const datosCaso = _buildDatosCaso(empresa, trab, contexto);

  // 3. Obtener plantilla base (lazy — plantillas.js ya cargado)
  const plantillaKey = TIPOS_DOCUMENTO[tipoDocumento]?.plantilla;
  const plantillaBase = (typeof PLANTILLAS !== 'undefined' && PLANTILLAS[plantillaKey]) || '';

  // 4. Construir prompt
  const userPrompt = _buildPrompt(tipoDocumento, datosCaso, plantillaBase);

  // 5. Llamar al agente vía Edge Function (la API key nunca sale al browser)
  const { data: { session } } = await _sb.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/agente-ia`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      system: SYSTEM_PROMPT_LABORAL,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errTxt = await response.text();
    throw new Error(`API ${response.status}: ${errTxt.slice(0, 200)}`);
  }

  const apiData = await response.json();
  const rawText = apiData.content[0].text.trim();

  // 6. Parsear JSON
  let documento;
  try {
    documento = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) documento = JSON.parse(match[0]);
    else throw new Error('El agente no devolvió JSON válido. Respuesta: ' + rawText.slice(0, 300));
  }

  // Adjuntar datos para el PDF
  documento._trabajador = trab;
  documento._empresa    = empresa;
  return documento;
}

// ─── Construcción del objeto de datos ────────────────────────────────────────
function _buildDatosCaso(empresa, trab, contexto) {
  const suc = trab.sucursales;
  return {
    empresa: {
      razonSocial:        empresa.nombre        || '',
      rfc:                empresa.rfc           || '',
      domicilioFiscal:    empresa.domicilio     || '',
      ciudad:             empresa.ciudad        || 'León, Guanajuato',
      representanteLegal: empresa.representante || '',
    },
    sucursal: {
      nombre:    suc?.nombre    || 'Matriz',
      domicilio: suc?.domicilio || empresa.domicilio || '',
      ciudad:    suc?.ciudad    || empresa.ciudad    || '',
      estado:    suc?.estado    || '',
    },
    trabajador: {
      nombre:              trab.nombre,
      rfc:                 trab.rfc,
      curp:                trab.curp,
      nss:                 trab.nss,
      edad:                trab.edad,
      estadoCivil:         trab.estado_civil,
      nacionalidad:        trab.nacionalidad || 'Mexicana',
      domicilio:           trab.domicilio,
      tipoIdentificacion:  trab.tipo_identificacion,
      numIdentificacion:   trab.num_identificacion,
      puesto:              trab.puesto,
      departamento:        trab.departamento,
      fechaIngreso:        trab.fecha_ingreso,
      fechaIngresoReconocida: trab.fecha_ingreso_reconocida || trab.fecha_ingreso,
      salario:             trab.salario_mensual,
      periodoSalario:      trab.periodo_salario,
      formaPago:           trab.forma_pago || 'depósito bancario',
      diasPago:            trab.dias_pago,
      tipoContrato:        trab.tipo_contrato,
      periodoPruebaDias:   trab.periodo_prueba_dias || 30,
      funciones:           trab.funciones,
      horaInicio:          trab.hora_inicio,
      horaFin:             trab.hora_fin,
      horaDescansoInicio:  trab.hora_descanso_inicio,
      horaDescansoFin:     trab.hora_descanso_fin,
      diasSemana:          trab.dias_semana,
      diaDescanso:         trab.dia_descanso,
      fechaVencimiento:    trab.fecha_vencimiento_contrato,
      nombreProyecto:      trab.nombre_proyecto,
      fechaFinProyecto:    trab.fecha_fin_proyecto,
      temporadas:          trab.temporadas,
      zonaAsignada:        trab.zona_asignada,
      diasPresentacion:    trab.dias_presentacion,
      horarioPresentacion: trab.horario_presentacion,
      tablaComisiones:     trab.tabla_comisiones,
      beneficiario1: { nombre: trab.beneficiario1_nombre, parentesco: trab.beneficiario1_parentesco, telefono: trab.beneficiario1_telefono },
      beneficiario2: { nombre: trab.beneficiario2_nombre, parentesco: trab.beneficiario2_parentesco, telefono: trab.beneficiario2_telefono },
    },
    contexto,
  };
}

// ─── Construcción del prompt ─────────────────────────────────────────────────
function _buildPrompt(tipoDocumento, datos, plantillaBase) {
  const tipoLabel = TIPOS_DOCUMENTO[tipoDocumento]?.label || tipoDocumento;
  return `Genera un ${tipoLabel} completamente personalizado para el siguiente caso.

═══ DATOS DE LA EMPRESA ═══
${JSON.stringify(datos.empresa, null, 2)}

═══ CENTRO DE TRABAJO ═══
${JSON.stringify(datos.sucursal, null, 2)}

═══ DATOS DEL TRABAJADOR ═══
${JSON.stringify(datos.trabajador, null, 2)}

═══ CONTEXTO ESPECÍFICO DEL CASO ═══
${JSON.stringify(datos.contexto, null, 2)}

═══ PLANTILLA BASE DE REFERENCIA ═══
Usa esta plantilla como estructura y lenguaje base, pero adapta completamente el contenido al caso:

${plantillaBase}

═══ INSTRUCCIONES FINALES ═══
1. Integra TODOS los datos del trabajador y empresa directamente en el texto
2. Adapta el contenido al contexto específico descrito
3. Si hay situaciones especiales crea cláusulas adicionales o modifica las existentes
4. Cita los artículos de la LFT que apliquen a ESTE caso particular
5. Si detectas riesgos legales, protege al patrón en el texto e indícalos en advertencia_legal
6. Responde SOLO con el JSON, sin markdown ni texto adicional`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  GENERACIÓN DE PDF DESDE DOCUMENTO DEL AGENTE
// ═══════════════════════════════════════════════════════════════════════════
function generarPDFDesdeAgente(documento) {
  const { jsPDF } = window.jspdf;
  const trab    = documento._trabajador || {};
  const empresa = documento._empresa    || {};
  const doc     = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(15, 20, 40);
  doc.rect(0, 0, pw, 30, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(255,255,255);
  doc.text(np(empresa.nombre || ''), pw/2, 10, { align:'center' });
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(180,185,200);
  doc.text(np([empresa.rfc, empresa.domicilio].filter(Boolean).join('  |  ')), pw/2, 18, { align:'center' });
  doc.setFillColor(21,128,61);
  doc.rect(ml - 2, 24, pw - ml - mr + 4, 12, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(15, 20, 40);
  doc.text(np(documento.titulo || ''), pw/2, 31.5, { align:'center' });
  let y = 46;

  const checkY = (needed = 22) => {
    if (y + needed > ph - 16) { doc.addPage(); y = 22; }
  };

  // ── Advertencia legal ────────────────────────────────────────────────────
  if (documento.advertencia_legal) {
    checkY(28);
    const wl = doc.splitTextToSize(np('NOTA LEGAL: ' + documento.advertencia_legal), tw - 10);
    const wh = wl.length * 5 + 10;
    doc.setFillColor(255, 248, 225); doc.setDrawColor(21,128,61); doc.setLineWidth(0.5);
    doc.roundedRect(ml, y, tw, wh, 2, 2, 'FD');
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(100, 60, 0);
    doc.text(wl, ml + 5, y + 7);
    y += wh + 8;
  }

  // ── Secciones ────────────────────────────────────────────────────────────
  (documento.secciones || []).forEach(sec => {
    checkY(18);
    if (sec.tipo === 'clausula' || sec.tipo === 'declaracion') {
      // Título dorado izquierdo
      doc.setFillColor(21,128,61);
      doc.rect(ml, y, 2.5, 7, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(21,128,61);
      const titulo = sec.numero ? `${sec.numero} — ${(sec.titulo||'').toUpperCase()}` : (sec.titulo||'').toUpperCase();
      doc.text(np(titulo), ml + 5, y + 5);
      y += 11;
    } else if (sec.tipo === 'cierre') {
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
      doc.line(ml, y, pw - mr, y);
      y += 6;
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
      doc.text(np(sec.titulo || ''), ml, y); y += 8;
    }
    if (sec.contenido) {
      doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(np(sec.contenido), tw);
      lines.forEach(line => {
        checkY(6);
        doc.text(line, ml, y); y += 5.5;
      });
      y += 5;
    }
  });

  // ── Firmas ───────────────────────────────────────────────────────────────
  checkY(72);
  y += 6;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  const colW = tw / 2 - 5;
  const c1 = ml, c2 = ml + colW + 10;
  doc.line(c1, y+20, c1+colW, y+20);  doc.line(c2, y+20, c2+colW, y+20);
  doc.line(c1, y+50, c1+colW, y+50);  doc.line(c2, y+50, c2+colW, y+50);
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE', c1+colW/2, y+25, {align:'center'});
  doc.text('EL TRABAJADOR',             c2+colW/2, y+25, {align:'center'});
  doc.text('TESTIGO 1',                 c1+colW/2, y+55, {align:'center'});
  doc.text('TESTIGO 2',                 c2+colW/2, y+55, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(np(empresa.nombre || ''), c1+colW/2, y+30, {align:'center'});
  if (empresa.representante) doc.text(np(empresa.representante), c1+colW/2, y+34, {align:'center'});
  doc.text(np(trab.nombre || ''), c2+colW/2, y+30, {align:'center'});
  if (trab.rfc) doc.text(`RFC: ${np(trab.rfc)}`, c2+colW/2, y+34, {align:'center'});
  y += 68;

  // ── Notas del agente ────────────────────────────────────────────────────
  if (documento.notas_agente) {
    checkY(20);
    doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(140,140,140);
    const nl = doc.splitTextToSize(np('Notas del agente IA: ' + documento.notas_agente), tw);
    doc.text(nl, ml, y); y += nl.length * 4.5;
  }

  // ── Footer en todas las páginas ──────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.2);
    doc.line(ml, ph - 11, pw - mr, ph - 11);
    doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(160,160,160);
    doc.text(np(`${documento.folio}  |  Página ${i} de ${total}  |  Capital Humano MX  |  Generado con IA  |  No sustituye asesoría jurídica`), pw/2, ph - 7, { align:'center' });
  }

  doc.save(`${(documento.folio || 'documento-ia').replace(/\s+/g,'-')}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODAL DEL AGENTE — 3 PASOS
// ═══════════════════════════════════════════════════════════════════════════

// Estado interno del modal
let _agenteState = { paso:1, tipo:null, trabajadorId:null, trabajadorNombre:'', tipoSugerido:null, documento:null, editando:false };

async function showModalAgente(trabajadorId, tipoSugerido = null) {
  // Gate de plan (defensa en profundidad; el 403 de la edge function es el candado real)
  if (typeof puedeUsar === 'function' && !puedeUsar('agente_ia')) {
    showModalPlanes('agente_ia');
    return;
  }
  // Obtener nombre del trabajador para el header
  let nombre = '';
  try {
    const { data: t } = await window.supabase.from('trabajadores').select('nombre').eq('id', trabajadorId).single();
    nombre = t?.nombre || '';
  } catch {}

  _agenteState = { paso:1, tipo: tipoSugerido, trabajadorId, trabajadorNombre: nombre, tipoSugerido, documento:null, editando:false };
  _renderModalAgente();
}

function _renderModalAgente() {
  const s = _agenteState;
  const stepper = `
    <div class="agente-stepper">
      <div class="agente-step ${s.paso >= 1 ? 'active' : ''} ${s.paso > 1 ? 'done' : ''}">
        <div class="agente-step-circle">${s.paso > 1 ? '✓' : '1'}</div>
        <span>Tipo de documento</span>
      </div>
      <div class="agente-step-line ${s.paso > 1 ? 'done' : ''}"></div>
      <div class="agente-step ${s.paso >= 2 ? 'active' : ''} ${s.paso > 2 ? 'done' : ''}">
        <div class="agente-step-circle">${s.paso > 2 ? '✓' : '2'}</div>
        <span>Datos del caso</span>
      </div>
      <div class="agente-step-line ${s.paso > 2 ? 'done' : ''}"></div>
      <div class="agente-step ${s.paso >= 3 ? 'active' : ''}">
        <div class="agente-step-circle">3</div>
        <span>Preview y descarga</span>
      </div>
    </div>`;

  const modal = document.getElementById('modal-agente');
  if (!modal) return;
  const inner = modal.querySelector('.agente-inner');
  if (!inner) return;

  inner.querySelector('.agente-stepper-wrap').innerHTML = stepper;
  const body = inner.querySelector('.agente-body');

  if (s.paso === 1) body.innerHTML = _renderPaso1();
  else if (s.paso === 2) body.innerHTML = _renderPaso2();
  else if (s.paso === 3) body.innerHTML = s.documento ? _renderPaso3() : _renderSpinner();
}

// ─── Paso 1: Selección de tipo de documento ──────────────────────────────────
function _renderPaso1() {
  const s = _agenteState;
  const categorias = [
    { id:'contrato',    label:'Contratos',         tipos:['contrato_indeterminado','contrato_determinado','contrato_obra','contrato_temporada','contrato_comision'] },
    { id:'acta',        label:'Actas Administrativas', tipos:['acta_amonestacion','acta_formal','acta_rescisoria'] },
    { id:'terminacion', label:'Terminación Laboral', tipos:['carta_renuncia','aviso_recision'] },
  ];
  return `
    <div style="margin-bottom:16px;">
      <div style="font-size:1rem;font-weight:700;color:var(--text-primary);">¿Qué documento necesitas generar?</div>
      <div style="font-size:.82rem;color:var(--text-muted);margin-top:4px;">
        Trabajador: <strong style="color:var(--text-primary);">${escapeHtml(s.trabajadorNombre)}</strong>
      </div>
    </div>
    ${categorias.map(cat => `
      <div style="margin-bottom:18px;">
        <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">${cat.label}</div>
        <div class="agente-tipos-grid">
          ${cat.tipos.map(tipoKey => {
            const t = TIPOS_DOCUMENTO[tipoKey];
            const esSugerido = tipoKey === s.tipoSugerido;
            const esSeleccionado = tipoKey === s.tipo;
            return `
              <div class="agente-tipo-card ${esSeleccionado ? 'selected' : ''} ${esSugerido && !esSeleccionado ? 'sugerido' : ''}"
                   onclick="seleccionarTipoDocumento('${tipoKey}')">

                <div class="agente-tipo-label">${t.label}</div>
                <div class="agente-tipo-desc">${t.desc}</div>
                ${esSugerido ? '<div class="agente-tipo-badge">Recomendado</div>' : ''}
              </div>`;
          }).join('')}
        </div>
      </div>`).join('')}
    <div style="display:flex;justify-content:flex-end;margin-top:8px;">
      <button class="btn-primary" onclick="agenteNextPaso()" ${!s.tipo ? 'disabled' : ''}>
        Continuar →
      </button>
    </div>`;
}

// ─── Paso 2: Formulario de contexto ─────────────────────────────────────────
function _renderPaso2() {
  const s = _agenteState;
  const t = TIPOS_DOCUMENTO[s.tipo];
  const preguntas = PREGUNTAS_CONTEXTO[s.tipo] || [];
  return `
    <div style="margin-bottom:16px;">
      <div style="font-size:1rem;font-weight:700;">${t.icono} ${t.label}</div>
      <div style="font-size:.82rem;color:var(--text-muted);margin-top:2px;">
        Cuéntale al agente los detalles específicos de este caso
      </div>
    </div>
    <div class="form-grid" style="margin-bottom:16px;">
      ${preguntas.map(p => `
        <div class="form-group span-2">
          <label class="form-label" for="ctx-${p.id}">${p.label}${p.required ? ' <span class="req">*</span>' : ''}</label>
          ${p.tipo === 'select' ? `
            <select id="ctx-${p.id}" class="form-select"${p.required ? ' required aria-required="true"' : ''}>
              <option value="">— Seleccionar —</option>
              ${(p.opciones || []).map(o => `<option value="${o}">${o}</option>`).join('')}
            </select>` : p.tipo === 'textarea' ? `
            <textarea id="ctx-${p.id}" class="form-textarea" rows="3"${p.required ? ' required aria-required="true"' : ''}
              placeholder="${p.placeholder || ''}"></textarea>` : `
            <input id="ctx-${p.id}" type="text" class="form-input"${p.required ? ' required aria-required="true"' : ''}
              placeholder="${p.placeholder || ''}" />`}
        </div>`).join('')}
    </div>
    <div id="agente-ctx-error" class="error-msg" role="alert" style="display:none;margin-bottom:8px;"></div>
    <div style="display:flex;gap:10px;justify-content:space-between;">
      <button class="btn-secondary" onclick="agentePrevPaso()">← Volver</button>
      <button class="btn-primary" id="btn-generar" onclick="agenteLanzar()">
        Generar Documento con IA
      </button>
    </div>`;
}

// ─── Spinner mientras genera ─────────────────────────────────────────────────
function _renderSpinner() {
  return `
    <div class="agente-spinner-wrap">
      <div class="agente-spinner-ring"></div>
      <div id="agente-spinner-msg" class="agente-spinner-msg">Analizando el caso…</div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-top:8px;">Esto puede tomar 15-30 segundos</div>
    </div>`;
}

// ─── Paso 3: Preview ─────────────────────────────────────────────────────────
function _renderPaso3() {
  const s = _agenteState;
  const doc = s.documento;
  if (!doc) return _renderSpinner();

  const seccionesHTML = (doc.secciones || []).map(sec => `
    <div class="agente-seccion" data-tipo="${escapeHtml(sec.tipo)}">
      ${sec.titulo ? `
        <div class="agente-seccion-titulo">
          ${sec.numero ? `<span class="agente-seccion-num">${escapeHtml(sec.numero)}</span>` : ''}
          ${escapeHtml(sec.titulo)}
        </div>` : ''}
      ${s.editando
        ? `<textarea class="form-textarea agente-edit-area" data-seccion-id="${escapeHtml(sec.numero || sec.titulo)}"
             rows="${Math.min(Math.max(sec.contenido?.split('\n').length || 3, 3), 12)}">${escapeHtml(sec.contenido)}</textarea>`
        : `<div class="agente-seccion-cuerpo">${escapeHtml(sec.contenido).replace(/\n/g, '<br>')}</div>`}
    </div>`).join('');

  return `
    <div class="agente-preview-header">
      <div>
        <div style="font-weight:700;font-size:.95rem;">${escapeHtml(doc.titulo)}</div>
        <div style="font-size:.78rem;color:var(--text-muted);">Folio: ${escapeHtml(doc.folio)}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary btn-sm" onclick="agenteToggleEditar()"
          style="${s.editando ? 'border-color:var(--green-ok);color:var(--green-ok);' : ''}">
          ${s.editando ? 'Aplicar edición' : 'Editar'}
        </button>
        <button class="btn-secondary btn-sm" onclick="agentePrevPaso()">Regenerar</button>
      </div>
    </div>

    ${doc.advertencia_legal ? `
      <div class="agente-advertencia">
        <strong>Nota legal del agente:</strong><br>${doc.advertencia_legal}
      </div>` : ''}

    <div class="agente-preview-body">
      ${seccionesHTML}
      ${doc.notas_agente ? `
        <div class="agente-notas">
          <strong>Notas del agente:</strong><br>${doc.notas_agente}
        </div>` : ''}
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-shrink:0;">
      <button class="btn-primary" onclick="agenteDescargarPDF()">
        Descargar PDF
      </button>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS DE NAVEGACIÓN DEL MODAL
// ═══════════════════════════════════════════════════════════════════════════
function seleccionarTipoDocumento(tipo) {
  _agenteState.tipo = tipo;
  // Actualizar UI sin re-renderizar todo
  document.querySelectorAll('.agente-tipo-card').forEach(c => c.classList.remove('selected'));
  const target = document.querySelector(`.agente-tipo-card[onclick*="${tipo}"]`);
  if (target) target.classList.add('selected');
  const btn = document.querySelector('.agente-body .btn-primary');
  if (btn) btn.disabled = false;
}

function agenteNextPaso() {
  if (!_agenteState.tipo) return;
  _agenteState.paso = 2;
  _renderModalAgente();
}

function agentePrevPaso() {
  if (_agenteState.paso === 3) {
    _agenteState.paso = 2;
    _agenteState.documento = null;
    _agenteState.editando = false;
  } else {
    _agenteState.paso = 1;
  }
  _renderModalAgente();
}

async function agenteLanzar() {
  // Validar campos requeridos
  const s = _agenteState;
  const preguntas = PREGUNTAS_CONTEXTO[s.tipo] || [];
  const err = document.getElementById('agente-ctx-error');
  const faltantes = preguntas.filter(p => p.required && !document.getElementById(`ctx-${p.id}`)?.value.trim());
  if (faltantes.length) {
    err.textContent = `Completa los campos obligatorios: ${faltantes.map(p => p.label).join(', ')}`;
    err.style.display = '';
    return;
  }
  err && (err.style.display = 'none');

  // Recoger contexto
  const contexto = {};
  preguntas.forEach(p => { contexto[p.id] = document.getElementById(`ctx-${p.id}`)?.value || ''; });

  // Ir a paso 3 (spinner)
  s.paso = 3;
  s.documento = null;
  _renderModalAgente();

  // Animar mensajes del spinner
  const msgs = ['Analizando el caso…', 'Consultando la LFT…', 'Redactando cláusulas…', 'Revisando fundamento legal…', 'Casi listo…'];
  let mi = 0;
  const spinInterval = setInterval(() => {
    const el = document.getElementById('agente-spinner-msg');
    if (el) el.textContent = msgs[mi++ % msgs.length];
  }, 2500);

  try {
    const documento = await generarDocumentoIA(s.tipo, s.trabajadorId, contexto);
    clearInterval(spinInterval);
    s.documento = documento;
    _renderModalAgente();
  } catch(e) {
    clearInterval(spinInterval);
    const body = document.querySelector('.agente-body');
    if (body) body.innerHTML = `
      <div class="alert alert-danger"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
        <div>
          <strong>Error al generar el documento</strong><br>
          <span style="font-size:.85rem;">${escapeHtml(e.message)}</span>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn-secondary" onclick="agentePrevPaso()">← Volver e intentar de nuevo</button>
        <button class="btn-primary" onclick="agenteLanzar()">Reintentar</button>
      </div>`;
  }
}

function agenteToggleEditar() {
  if (_agenteState.editando) {
    // Aplicar cambios de los textareas al documento
    const areas = document.querySelectorAll('.agente-edit-area');
    areas.forEach((ta, i) => {
      if (_agenteState.documento?.secciones?.[i]) {
        _agenteState.documento.secciones[i].contenido = ta.value;
      }
    });
  }
  _agenteState.editando = !_agenteState.editando;
  const body = document.querySelector('.agente-body');
  if (body) body.innerHTML = _renderPaso3();
}

function agenteDescargarPDF() {
  if (!_agenteState.documento) return;
  const btn = document.querySelector('.agente-body .btn-primary');
  btnCargando(btn, 'Generando PDF…');
  try {
    generarPDFDesdeAgente(_agenteState.documento);
  } catch(e) { alert('Error generando PDF: ' + e.message); }
  setTimeout(() => { btnRestaurar(btn); }, 2000);
}

function closeModalAgente() {
  const modal = document.getElementById('modal-agente');
  if (modal) modal.style.display = 'none';
  if (typeof _agenteFocusReturn !== 'undefined' && _agenteFocusReturn && document.body.contains(_agenteFocusReturn)) {
    _agenteFocusReturn.focus();
  }
  _agenteFocusReturn = null;
}
