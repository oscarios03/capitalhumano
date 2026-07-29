# Casos de prueba — motor fiscal

Casos verificables a mano para el motor fiscal (migración 32). Las funciones son
puras: se pueden ejecutar en la consola del navegador con la app cargada.

**Valores vigentes usados** (`config_valores`, migración 15 y 32):
UMA diaria $117.31 · SMG general $315.04 · subsidio 15.02% de la UMA mensual ·
límite de subsidio $11,492.66/mes.

> ⚠️ Al actualizarse la UMA (febrero) o el Anexo 8 de la RMF (enero), los
> resultados esperados de abajo cambian. Recalcular los casos con la fuente
> oficial antes de dar por rota una prueba.

---

## 1. ISR por periodicidad — tarifas del Anexo 8 RMF 2026

Las tarifas semanal y quincenal se derivan de la mensual (diaria = mensual/30.4;
semanal = diaria×7; quincenal = diaria×15), que es como las construye el SAT.

| # | Entrada | Esperado |
|---|---------|----------|
| 1.1 | `calcISR(10000, 'mensual')` | Renglón 3 (7,168.52–12,598.02): ISR bruto = 420.95 + (10000−7168.52)×0.1088 = **$729.02**. Base ≤ 11,492.66 → subsidio = 117.31×30.4×0.1502 = **$535.65**. `isrNeto` = **193.37** |
| 1.2 | `calcISR(8000, 'mensual')` | ISR bruto = 420.95 + (8000−7168.52)×0.1088 = 511.42. Subsidio ($535.65) **topado al ISR** → subsidio = 511.42, `isrNeto` = **0** (el subsidio ya no es entregable en efectivo) |
| 1.3 | `calcISR(5000, 'quincenal')` | El ISR quincenal ×2.0267 debe quedar dentro de ±$1 del ISR de `calcISR(10133, 'mensual')` (≈ **207.88**) |
| 1.4 | `calcISR(0, 'mensual')` | `{ isr: 0, subsidio: 0, isrNeto: 0 }` |
| 1.5 | `calcISR(15000, 'mensual')` | Base > 11,492.66 → **subsidio = 0**, `isrNeto` = ISR bruto |

**Regresión clave:** antes de la migración 32 el ISR semanal/quincenal se
derivaba mensualizando con factor 52/12 y 2. Ahora cada periodicidad usa su
tarifa. Diferencias de centavos son esperadas; diferencias de pesos indican error.

---

## 2. ISR de aguinaldo y PTU (Art. 174 RLISR)

Exención: aguinaldo 30 UMA = **$3,519.30**; PTU 15 UMA = **$1,759.65**.

| # | Entrada | Esperado |
|---|---------|----------|
| 2.1 | Aguinaldo de $5,000, salario mensual $10,000 | Exento 3,519.30 · gravado **1,480.70** · `calcISRArt174(1480.70, 10000)`: promedio = 1480.70/365×30.4 = 123.33; ISR(10123.33) − ISR(10000) = 13.42; tasa = 10.88%; ISR ≈ **$161.10** |
| 2.2 | Aguinaldo de $3,000, salario $10,000 | Gravado 0 → ISR **$0** (exención cubre todo) |
| 2.3 | PTU de $2,000, salario $10,000 | Exento 1,759.65 · gravado 240.35 · ISR ≈ **$26.15** |
| 2.4 | PTU de $50,000, salario $10,000 | Tope 3 meses (Art. 127 fr. VIII LFT) = 30,000 → `total` = **30,000**, `topado` = true |

Verificación de la tasa: `calcISRArt174(g, s).tasa` debe caer siempre entre 0 y
0.35, y crecer con el salario ordinario.

---

## 3. Cuotas patronales IMSS (`calcIMSSPatronal`)

Caso base: SBC diario **$500**, 30.4 días, UMA 117.31, prima de riesgo 0.54355%.

Excedente = 500 − 3×117.31 = **$148.07**. SBC en UMA = 500/117.31 = 4.26 → CEAV
renglón "4.01 UMA en adelante" = **7.513%**.

| Ramo | Cálculo diario | Diario |
|------|----------------|--------|
| Cuota fija EyM | 117.31 × 20.40% | 23.93 |
| Excedente 3 UMA | 148.07 × 1.10% | 1.63 |
| Prest. en dinero | 500 × 0.70% | 3.50 |
| Gastos médicos pens. | 500 × 1.05% | 5.25 |
| Riesgos de trabajo | 500 × 0.54355% | 2.72 |
| Invalidez y vida | 500 × 1.75% | 8.75 |
| Guarderías | 500 × 1.00% | 5.00 |
| Retiro | 500 × 2.00% | 10.00 |
| CEAV | 500 × 7.513% | 37.57 |
| **Total diario** | | **≈ 98.34** |

Esperado: `calcIMSSPatronal(500, 30.4, 117.31, 0.54355).total` = **$2,989.62**
(≈19.7% del salario mensual de 15,200).

**Casos de frontera:**
- **3.2 — Tope 25 UMA:** `calcIMSSPatronal(5000, 30.4, 117.31, 0.54355)` debe dar
  lo mismo que con SBC = 25×117.31 = 2,932.75 (el exceso no cotiza, Art. 28 LSS)
  → **$14,568.52**.
- **3.3 — SBC ≤ 3 UMA:** con SBC 300, el ramo `excedente` debe ser **0**.
- **3.4 — CEAV progresiva** (`_ceavPatronalPct`): SBC 315.04 (1 SM) → **3.150%**;
  SBC 500 (4.26 UMA) → **7.513%**; SBC 400 (3.41 UMA) → **6.361%**.
- **3.5 — Prima de riesgo:** duplicar la prima (0.54355 → 1.0871) debe subir el
  total exactamente en `SBC × 0.54355% × días` = **$82.62**.

> **Sobre los renglones bajos de la tabla CEAV:** los rangos de 1.01 SM a 4.00 UMA
> son inalcanzables con datos válidos, porque 1 SM ($315.04) ya equivale a 2.69 UMA
> y el SBC nunca puede ser inferior al salario mínimo. `_ceavPatronalPct` aplica la
> cuota de 1 SM (3.150%) a cualquier SBC igual o menor al mínimo — un piso para
> datos mal capturados — y las tarifas por UMA de ahí hacia arriba.

---

## 4. Costo total del empleado (`costoTotalEmpleado`)

Trabajador de $15,000 mensuales, 1 año de antigüedad, prestaciones de ley
(15 días de aguinaldo, 12 de vacaciones, prima 25%), ISN 3%:

| Concepto | Esperado |
|----------|----------|
| Salario mensual | 15,000 |
| IMSS patronal | 2,989.62 (SBC 500/día) |
| INFONAVIT 5% | 500 × 5% × 30.4 = 760 |
| ISN 3% | 450 |
| Provisión aguinaldo | 500 × 15/12 = 625 |
| Provisión vacaciones | 500 × 14/12 = 583.33 (año 2 de servicio: 14 días) |
| Provisión prima vac. | 583.33 × 25% = 145.83 |
| **Total** | **$20,553.78** → `factorSobreSalario` = **1.37** |

El factor debe caer entre **1.25 y 1.45** para un salario típico con
prestaciones de ley. Fuera de ese rango, revisar.

---

## 5. Ajuste anual de ISR (Art. 97 LISR)

| # | Escenario | Esperado |
|---|-----------|----------|
| 5.1 | Base anual $120,000, ISR retenido $4,000 | ISR anual = 5,051.37 + (120,000−86,022.12)×0.1088 = **$8,748.16**; diferencia = **+4,748.16** (a cargo) |
| 5.2 | Base anual $120,000, ISR retenido $10,000 | Diferencia = **−1,251.84** (a favor) |
| 5.3 | Base anual $450,000 | `aplica` = false, motivo "Ingresos anuales superiores a $400,000.00" |
| 5.4 | Ingresó el 15-mar del ejercicio | `aplica` = false, motivo "Inició labores durante el ejercicio" |
| 5.5 | Aplicar dos veces seguidas | El neto del recibo de diciembre debe quedar **igual** tras la segunda aplicación (revierte el ajuste previo antes de escribir el nuevo) |

---

## 6. Baja documentada como renuncia y propuesta de finiquito (migración 38)

**Trabajador de referencia para todos los casos de esta sección:**
salario mensual **$15,000** (diario $500), ingreso **24-mar-2023**, baja **24-jul-2026**,
sin días pendientes, sin vacaciones devengadas de años anteriores, zona general.
De ahí: SDI = **$526.7123**, tope de prima de antigüedad 2×SMG = $630.08 (no aplica,
el SDI es menor), antigüedad = 3 años (**3.3370** de fracción).

### 6.1 Piso irrenunciable — la prima de antigüedad es el interruptor

| # | Entrada | Esperado |
|---|---------|----------|
| 6.1.1 | `calcFiniquito({...P, tieneAntig:false})` | Vacaciones 3,168.91 + prima vac. 792.23 + aguinaldo 4,415.73 = **$8,376.87**; `pa` = **0** |
| 6.1.2 | `calcFiniquito({...P, tieneAntig:true})` | **$29,468.45**; `pa` = 3.3370 × 12 × 526.7123 = **$21,091.58** |
| 6.1.3 | Diferencia entre ambos | Exactamente la prima de antigüedad: **$21,091.58** |
| 6.1.4 | `calcLiquidacion(P)` (referencia de juicio) | **$112,025.19** — es lo que se compara contra cada escenario |

> La casilla de prima de antigüedad es la decisión con más impacto del módulo: son
> $21,091.58 sobre un finiquito de $8,376.87. Cuando la causa real es un despido y
> se documenta como renuncia, incluirla es lo defendible (Art. 162 LFT).

### 6.2 Escenarios de gratificación

Base SDI, modo `suma` (`calcPropuestaBaja({...P, tieneAntig:true, baseDias:'sdi', modo:'suma'})`):

| # | Escenario | Esperado |
|---|-----------|----------|
| 6.2.1 | "Solo lo irrenunciable" | gratificación 0, total = finiquito = **$29,468.45** |
| 6.2.2 | 60 días | gratificación = 60 × 526.7123 = **$31,602.74**; total = **$61,071.19**; `pctVsLiquidacion` ≈ **54.5%** |
| 6.2.3 | Cualquier escenario | `total` = `finiquito.total` + `gratificacion`, sin excepción |
| 6.2.4 | `montoManual: 25000` | Escenario extra con `dias: null` y gratificación **$25,000**; total **$54,468.45** |
| 6.2.5 | `diasManual: 60` | **No** agrega escenario duplicado (60 ya está en la lista fija) |

Base salario diario, modo `incluye` (los días son el paquete total):

| # | Escenario | Esperado |
|---|-----------|----------|
| 6.2.6 | 15 días | total = 15 × 500 = **$7,500** < finiquito → `insuficiente: true`, `faltante` = **$21,968.45** |
| 6.2.7 | 90 días | total = **$45,000**; gratificación = 45,000 − 29,468.45 = **$15,531.55**; `insuficiente: false` |

> El caso 6.2.6 es el que la UI debe marcar en rojo: un "paquete de 15 días" no
> alcanza a cubrir lo que la ley obliga a pagar.

### 6.3 ISR de la terminación (Art. 93 fr. XIII y Art. 96 LISR)

Con UMA $117.31 y 3 años de servicio reconocidos (`aniosServicioFiscales(3.3370)` = **3**,
porque la fracción 0.337 no llega a seis meses), sobre el escenario de 60 días:

| Concepto | Importe | Exento | Gravado | ISR |
|----------|--------:|-------:|--------:|----:|
| Indemnizaciones, prima de antigüedad y gratificación | 52,694.32 | **31,673.70** | 21,020.62 | **1,965.87** |
| Aguinaldo proporcional | 4,415.73 | 3,519.30 | 896.43 | 160.64 |
| Prima vacacional | 792.23 | 792.23 | 0 | 0 |
| Vacaciones proporcionales y devengadas | 3,168.91 | 0 | 3,168.91 | 567.87 |
| **Totales** | **61,071.19** | **35,985.23** | **25,085.96** | **2,694.38** |

Neto estimado: **$58,376.81**.

| # | Entrada | Esperado |
|---|---------|----------|
| 6.3.1 | Exención de separación | 90 × 117.31 × 3 = **$31,673.70** (90 UMA **por año**, no por baja) |
| 6.3.2 | `aniosServicioFiscales(3.337)` | **3** — la fracción de 0.337 años (≈4 meses) no llega a seis meses |
| 6.3.3 | `aniosServicioFiscales(3.6)` | **4** — fracción mayor a seis meses = año completo |
| 6.3.4 | `aniosServicioFiscales(0.2)` | **1** — el mínimo es un año |
| 6.3.5 | `calcISRSeparacion(100000, 15000)` | tasa = ISR(15,000)/15,000 = **0.093521**; ISR = ISR(15,000) + 85,000×tasa = **$9,352.12** |
| 6.3.6 | Escenario de 15 días | ISR **idéntico** al de "solo lo irrenunciable": la bolsa de separación (28,992.26) sigue por debajo de la exención |
| 6.3.7 | Salarios pendientes con salario bajo | Usan `calcISR` con la periodicidad del trabajador, así que el subsidio al empleo puede dejarlos en ISR 0 |

> **Ojo con el procedimiento.** Las percepciones por separación NO usan el
> Art. 174 RLISR (el de aguinaldo y PTU): usan el último párrafo del Art. 96 LISR,
> que separa una cantidad igual al último sueldo mensual ordinario y aplica al
> remanente la tasa efectiva de ese sueldo. Son funciones distintas:
> `calcISRSeparacion` vs `calcISRArt174`.

### 6.4 Registro y trazabilidad (no fiscal, pero se rompe igual de fácil)

| # | Acción | Esperado |
|---|--------|----------|
| 6.4.1 | Despido injustificado **sin** documentar como renuncia | `bajas.tipo_baja` = `injustificada`, `documentado_como` = `causa_real`, cálculo `liquidacion`, causa IMSS **01**, documentos: Aviso de Rescisión + Recibo de Liquidación |
| 6.4.2 | Despido injustificado **documentado como renuncia** | `tipo_baja` sigue siendo `injustificada`, `documentado_como` = `renuncia`, cálculo `finiquito`, causa IMSS **02**, documentos: Carta de Renuncia + Recibo de finiquito y gratificación |
| 6.4.3 | Reporte de rotación | Debe seguir mostrando la **causa real**, nunca la documentada |
| 6.4.4 | Borrador de propuesta | Al guardarlo queda `estado: 'borrador'`; al consumar la baja pasa a `aplicada` con `baja_id`. Solo puede existir un borrador por trabajador (índice único parcial) |
| 6.4.5 | Recibo sin gratificación | El PDF debe salir **idéntico** al de antes de la migración 38: sin bloque "I. PRESTACIONES DE LEY", sin bloque II y sin desglose fiscal |

---

## Cómo ejecutarlos

Con la app cargada y sesión iniciada, en la consola del navegador:

```js
// 1.1
calcISR(10000, 'mensual')            // → { isr: 729.02, subsidio: 535.65, isrNeto: 193.37 }
// 2.1
calcISRArt174(1480.70, 10000)        // → { isr: 161.10, tasa: 0.1088 }
// 3.1
calcIMSSPatronal(500, 30.4, 117.31, 0.54355)   // → total: 2989.62
// 4
costoTotalEmpleado({ salario_mensual: 15000, periodo_salario: 'mensual', fecha_ingreso: '2025-01-01' })
                                     // → total: 20553.78, factorSobreSalario: 1.37
// 5.1
calcISRAnual(120000)                 // → 8748.16

// 6 — baja documentada como renuncia (migración 38)
const P = { startDate:new Date('2023-03-24T00:00:00'), endDate:new Date('2026-07-24T00:00:00'),
            salario:15000, monthlySalary:15000, periodoSalario:'mensual', smgZone:'general',
            diasPendientes:0, tieneAntig:true, vacacionesPendientes:0, aguinaldoPagado:false };
calcFiniquito(P).total                          // → 29468.45
calcLiquidacion(P).total                        // → 112025.19
const prop = calcPropuestaBaja({ ...P, baseDias:'sdi', modo:'suma' });
prop.escenarios.find(e => e.dias === 60)        // → total 61071.19, isr 2694.38, neto 58376.81
calcISRSeparacion(100000, 15000)                // → { isr: 9352.12, tasa: 0.093521 }
aniosServicioFiscales(3.337)                    // → 3
```

Los casos de arriba se validaron ejecutando estas funciones contra el código real
(22 de 25 a la primera; los 3 restantes eran errores de aritmética de esta guía,
ya corregidos).
