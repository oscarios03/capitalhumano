# Contexto de sesión — continuar aquí tras compactar

> Escrito el 17 de julio de 2026 para sobrevivir a una compactación de contexto.
> Si acabas de retomar y no recuerdas la conversación: **este archivo + los dos
> que menciona abajo son toda la memoria que necesitas.** Léelos antes de actuar.

## En una frase

Voy a la mitad de un plan de 11 fases para mejorar Capital Humano MX (plataforma
de RRHH/nómina para México). **6 fases hechas y commiteadas, 5 pendientes.**
Trabajo una fase a la vez, un commit por fase, verificando con un harness de Node.

## Los tres documentos de memoria

1. **`docs/ESTADO-MEJORAS-RH.md`** — el estado completo y detallado: qué se hizo,
   los 11 bugs preexistentes, las decisiones de diseño no obvias, qué falta, las
   preguntas abiertas y cómo se verifica. **Es la fuente principal.**
2. **`docs/PROMPT-CONTINUAR.md`** — el prompt de arranque y el orden sugerido de
   las fases pendientes.
3. Este archivo — resumen mínimo para reorientarse rápido.

## Estado exacto ahora mismo

- **Rama:** `claude/hr-platform-mexico-review-7c46e2` (worktree).
- **Supabase producción:** KAPITAL HUMANO (`xqbzxkujooarntawzsoc`). Migraciones
  **32, 33 y 34 YA APLICADAS y verificadas.** Siguiente número libre: **35**.
- **Commits de la sesión** (sobre `79cfcef`):
  - `055c894` Fase 1 — motor fiscal (mig. 32) [+ Fase 11 simulador de despido]
  - `3126081` Fase 2 — roles y permisos RLS (mig. 33)
  - `367d61d` Fase 3 — dashboard: costo de nómina + obligaciones
  - `a0e3a53` Fase 4 — trabajadores: validaciones + kit de defensa (mig. 34)
  - `4c52d77` Fase 5 — asistencia: vista del mes + retardo automático
  - *(pendiente de commit: estos 3 archivos de docs)*

## Fases pendientes (orden recomendado)

**8 → 9 → 10 → 7 → 6.** Razón: la 6 está bloqueada por formatos bancarios que no
tengo, y la 7 se encogió (7.3 ya se hizo en la Fase 2; la columna
`recibos_nomina.prima_vacacional` ya existe desde la migración 05, así que **la
migración 36 ya no hace falta**). Detalle de cada una en `ESTADO-MEJORAS-RH.md`
sección 5.

- **Fase 8** — IMSS: variabilidad bimestral del SBC. Sección nueva en `imss.js`.
- **Fase 9** — 4 reportes gerenciales en `reportes.js` (rotación, ausentismo,
  costo por departamento, antigüedades).
- **Fase 10** — WhatsApp wa.me. El campo `telefono` ya existe (Fase 4); falta
  `js/whatsapp.js` y los botones.
- **Fase 7** — prima vacacional al gozar + constancia Art. 81.
- **Fase 6** — nómina: layouts bancarios (BLOQUEADA, ver abajo), paquete
  contador, caja de ahorro, pago mixto.

## Reglas de trabajo que no debo olvidar

- Vanilla JS sin build. Módulo nuevo = `<script src="js/X.js?v=1">` en
  `app/app.html`; subir el `?v=` al modificar uno existente.
- **supabase-js NO lanza excepciones: revisar `.error` siempre** (ya causó un bug).
- Migraciones idempotentes + degradación elegante (console.warn + fallback).
- Cada fase actualiza su sección del manual (`renderManual` en `app.js`).
- **Verificar con vectores oficiales, no de memoria** — así salió que la tabla
  ISR estaba desactualizada. Harness de Node con `vm` (ver sección 7 de
  `ESTADO-MEJORAS-RH.md`). Renderizar en el navegador antes de dar por bueno.
- Si una prueba falla, distinguir si está mal el código o la expectativa.
- Al terminar una fase: resumir y **preguntar antes de seguir** con la siguiente.

## Decisiones del usuario ya tomadas (no repreguntar)

- WhatsApp: enlaces `wa.me` con texto prellenado, **sin envío automático ni PDF**.
- Roles: RLS + gating de UI. · Vacaciones: RH captura, gerente/admin aprueba.
- Ajuste anual ISR: cálculo + aplicación en diciembre.

## Pendiente de decidir

**Fase 6.1 — layouts bancarios.** BBVA/Banorte/Santander usan formatos
propietarios que el usuario no ha proporcionado. **No inventar un layout.** Si se
llega a esa fase antes, construir la arquitectura (selector + generador + CSV
genérico actual) marcando cada formato como "verificar contra el manual del
banco", y avisar.

## Trampa importante

`handle_new_user()` está en las migraciones 00, 21 y **33** (canónica). La **21
NO está aplicada**. La versión de la 33 incluye el alta de suscripción de la 21
condicionada a que exista la tabla. **Si se aplica la 21 por separado, re-correr
la 33** o los invitados dejan de entrar a su empresa.
