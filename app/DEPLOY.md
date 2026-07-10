# Deploy — Capital Humano MX

## Edge Functions

### agente-ia (Agente de Documentos Laborales con IA)

La función `supabase/functions/agente-ia/` actúa como proxy seguro hacia la API de Anthropic.
La API key **nunca llega al browser** — vive únicamente en las variables de entorno de Supabase.

#### 1. Configurar la API key en Supabase

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-tukey
```

Verifica que quedó guardada:

```bash
supabase secrets list
```

#### 2. Desplegar la función

```bash
supabase functions deploy agente-ia
```

#### 3. Verificar que funciona

```bash
supabase functions invoke agente-ia --body '{"model":"claude-opus-4-5","max_tokens":10,"messages":[{"role":"user","content":"ping"}]}'
```

---

### send-emails (Notificaciones por correo)

Ver instrucciones dentro de `supabase/functions/send-emails/index.ts`.

Variables requeridas:

```bash
supabase secrets set EMAIL_PROVIDER=resend
supabase secrets set EMAIL_API_KEY=re_...
supabase secrets set FROM_EMAIL=alertas@tudominio.com
```

---

## Migraciones de base de datos

Ver `app/migrations/README.md` para el orden de aplicación en el SQL Editor de Supabase.
