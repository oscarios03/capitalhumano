# Conectar un reloj checador físico (huella / facial)

Capital Humano MX no se conecta directamente a hardware — los checadores de
huella/facial normalmente solo guardan sus registros en el propio equipo o en
el software del fabricante, sin capacidad de llamar a una URL externa. La
forma de conectarlos es con un **agente puente**: un pequeño programa que
corre en una PC de la oficina, en la misma red que el checador, que lee los
pulsos nuevos y los reenvía a Capital Humano MX.

```
[Reloj checador]  <—LAN/USB—>  [Agente puente en una PC]  —HTTPS—>  [Capital Humano MX]
   (huella/facial)                 (Node.js, corre 24/7)          (Edge Function checador-webhook)
```

## 1. Generar tu API key

En la app: **Reloj Checador → Checadores Físicos → Generar API Key**.
Cópiala de inmediato — solo se muestra una vez (solo se guarda su hash).

## 2. Asignar el "código de checador" a cada trabajador

En **Reloj Checador → Modo Kiosco**, cada trabajador tiene un botón
"➕ Gafete" que genera su `codigo_checador`. Ese mismo valor es el que debes
capturar como "ID de usuario" en el software de tu checador (la mayoría de
los equipos de huella permiten asignar un ID/código a cada usuario dado de
alta en el dispositivo).

## 3. Endpoint

```
POST https://<tu-proyecto>.supabase.co/functions/v1/checador-webhook
Headers:
  Content-Type: application/json
  x-api-key: <tu API key>
Body:
{
  "codigo_checador": "abc123...",     // el mismo código asignado al trabajador
  "ts": "2026-06-30T08:02:00-06:00",  // opcional, default: ahora
  "dispositivo": "Checador Recepción" // opcional
}
```

Respuesta:
```json
{ "ok": true, "trabajador_nombre": "Juan Pérez", "tipo": "entrada", "hora": "08:02:00" }
```

No es necesario indicar si es entrada o salida: el primer pulso del día para
ese trabajador se registra como entrada, y cualquier pulso posterior en el
mismo día actualiza la hora de salida.

## 4. Script de referencia (ZKTeco)

`docs/ejemplo-agente-zkteco.js` es una **plantilla de ejemplo**, no un
producto soportado ni probado contra un equipo real en este entorno. Está
pensada como punto de partida para un integrador o para el propio cliente,
usando la librería `node-zklib` (protocolo TCP/IP típico de los equipos
ZKTeco). Para otras marcas (Anviz, Hikvision, Suprema, etc.) la lógica de
lectura del dispositivo cambia, pero el envío al webhook es el mismo.

Uso:
```bash
npm install node-zklib node-fetch
CHECADOR_IP=192.168.1.201 API_KEY=chk_live_... node ejemplo-agente-zkteco.js
```

El agente debe correr de forma continua (ej. como servicio de Windows con
`node-windows`, o una tarea programada que reinicie el proceso) en una PC con
acceso de red al checador.
