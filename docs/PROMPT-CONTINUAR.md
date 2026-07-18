# Prompt para continuar en otra sesión

Copia y pega **todo lo que está dentro del bloque** en la nueva sesión de Claude
Code, desde este mismo worktree.

---

```
Continúo un plan de mejoras de Capital Humano MX (plataforma de RRHH/nómina para
México). Ya se completaron 6 de 11 fases en una sesión anterior.

ANTES DE TOCAR NADA, lee estos tres archivos:
1. docs/ESTADO-MEJORAS-RH.md  — el estado completo: qué se hizo, qué bugs
   preexistentes aparecieron, las decisiones de diseño y qué falta.
2. C:\Users\oscar\.claude\plans\attach-velvety-meteor.md — el plan original.
3. app/migrations/README.md — convenciones de migraciones y la tabla de
   definiciones supersedidas.

CONTEXTO CLAVE:
- Rama: claude/hr-platform-mexico-review-7c46e2. Working tree limpio, 6 commits.
- Supabase en producción: KAPITAL HUMANO (xqbzxkujooarntawzsoc). Las migraciones
  32, 33 y 34 YA ESTÁN APLICADAS y verificadas — no volver a aplicarlas.
  La siguiente numeración libre es la 35.
- Vanilla JS sin build. Módulo nuevo = <script src="js/X.js?v=1"> en app/app.html,
  y hay que subir el ?v= al modificar uno existente.
- supabase-js NO lanza excepciones: siempre revisar .error (ya causó un bug).
- Las migraciones deben ser idempotentes y degradar con elegancia si no están
  aplicadas (console.warn + fallback, como en generarNominaPeriodo).
- Cada fase actualiza su sección del manual (renderManual en app.js).

DECISIONES YA TOMADAS POR MÍ (no volver a preguntarlas):
- WhatsApp: enlaces wa.me con mensaje prellenado, SIN envío automático ni PDF
  adjunto — yo decido y adjunto a mano.
- Roles: enforcement real en RLS + gating de UI.
- Vacaciones: RH captura, gerente/admin aprueba (sin acceso de empleados).
- Ajuste anual ISR: cálculo + aplicación en la nómina de diciembre.

CÓMO SE VERIFICA AQUÍ (importante, síguelo):
- No hay framework de pruebas. Se usa un harness de Node con `vm` que carga los
  .js del proyecto con stubs de CTX/document/getConfigValor. Ver la sección 7 de
  docs/ESTADO-MEJORAS-RH.md. Ya van 91 casos verificados.
- Para lógica con reglas legales (fechas, cálculos), busca la fuente oficial y
  usa vectores de prueba verificados — no te fíes de tu memoria. En esta sesión
  eso destapó que la tabla de ISR estaba desactualizada.
- Para RLS: simular el JWT de cada rol contra la BD real dentro de una
  transacción que se revierte con un RAISE EXCEPTION final.
- Renderiza el HTML con el CSS real en el navegador antes de darlo por bueno: eso
  encontró cosas que las pruebas no ven. El servidor estático ya está en
  .claude/launch.json (preview_start con name "static"). app/app.html redirige al
  login sin sesión, así que para ver componentes sueltos genera un HTML de vista
  previa temporal y bórralo después.
- Si una prueba falla, distingue si está mal el código o la expectativa. En esta
  sesión pasaron las dos cosas — no ajustes el test a ciegas.

TAREA: continúa con las fases pendientes en este orden: 8 (variabilidad
bimestral del IMSS), 9 (reportes gerenciales), 10 (WhatsApp wa.me), 7 (prima
vacacional al gozar + constancia Art. 81; su punto 7.3 ya está hecho) y al final
la 6 (nómina). Trabaja una fase a la vez y haz un commit por fase, con el
formato de mensaje de los commits anteriores (git log). Si encuentras bugs
preexistentes, arréglalos y dímelo — en esta sesión salieron 11, varios graves.

Empieza por la Fase 8. Cuando termines una fase, resume qué hiciste y pregúntame
antes de seguir con la siguiente.

PENDIENTE DE DECIDIR (Fase 6.1): los layouts de dispersión bancaria (BBVA,
Banorte, Santander) son formatos propietarios que no tengo. NO inventes un
layout: si llegas a esa fase antes de que yo consiga los manuales, construye la
arquitectura (selector de banco + generador por formato + el CSV genérico
actual) dejando cada formato marcado como "verificar contra el manual de tu
banco", y avísame.
```

---

## Notas sobre este prompt

- **Deja las fases 6 y 7 al final a propósito.** La 6 está bloqueada por los
  formatos bancarios y la 7 quedó reducida (7.3 ya se hizo en la Fase 2, y la
  columna que requería ya existe), así que la 8 y la 9 aportan más y no dependen
  de nada.
- **Si ya conseguiste los manuales de los bancos**, agrega al final del prompt:
  *"Ya tengo los layouts de BBVA/Banorte/Santander: te los paso cuando llegues a
  la Fase 6"* — y quita el último párrafo.
- **Si quieres que vaya de corrido sin preguntar** entre fases, cambia la última
  línea de la sección TAREA por: *"No me preguntes entre fases; hazlas todas y
  dame un resumen al final."*
