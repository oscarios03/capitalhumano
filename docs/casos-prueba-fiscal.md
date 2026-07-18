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
```

Los casos de arriba se validaron ejecutando estas funciones contra el código real
(22 de 25 a la primera; los 3 restantes eran errores de aritmética de esta guía,
ya corregidos).
