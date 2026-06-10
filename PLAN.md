# Plan del Sistema de Pagos — Guayafood 🥟

> **Framework:** Astro v6.4.5 (output: `static`) con `@astrojs/vercel` adapter  
> **Stack:** Tailwind CSS v4 · Mercado Pago Checkout Pro · Google Sheets API · Nominatim (OSM)  
> **Hosting:** Vercel (despliegue automático desde `main`)  
> **Package manager:** pnpm  
> **Estado actual:** 🟢 Funcional — pagos MP, verificación server-side, validación CABA por barrio + CPA + Nominatim

---

## 📦 Arquitectura actual

```
src/pages/index.astro  ← landing + redirect handler post-MP
  ├── OrderModal.astro   ← modal de pedido con formulario
  ├── /api/check-availability.ts  ← disponibilidad de slots
  ├── /api/create-preference.ts   ← crea preferencia en MP
  ├── /api/mercadopago-webhook.ts ← IPN de MP (HMAC-SHA256)
  ├── /api/verify-payment.ts      ← verificación server-side post-pago
  ├── /api/save-order.ts          ← guarda en Google Sheets
  └── /api/validate-address.ts    ← valida que la dirección sea CABA
```

### Flujo pago exitoso

```
Usuario → OrderModal → /api/create-preference → MP Checkout Pro
                                                    ↓
                                              Usuario paga
                                                    ↓
                    Vuelve a /?status=approved&payment_id=xxx
                                                    ↓
                    index.astro llama /api/verify-payment → confirma
                                                    ↓
                    saveOrder() → /api/save-order (Google Sheets)
                                                    ↓
                    Muestra banner ✅ + redirige a WhatsApp (wa.me)
```

---

## 🧠 Decisiones y contexto importante

### Migración de API routes (razón de 500 errors iniciales)
- Originalmente las APIs estaban en `/api/` (Vercel Functions con TypeScript compilado)
- Daban **500 error** porque Vercel no deployaba correctamente funciones TS junto con output estático de Astro
- **Solución:** migrar a `src/pages/api/` (Astro API endpoints con `export const prerender = false`)
- El adapter `@astrojs/vercel` se encarga del bundle y deploy como serverless functions
- Se eliminó la carpeta `/api/` raíz y `outputDirectory` de `vercel.json`

### Validación de dirección CABA (3 capas en orden)

| Capa | Método | ¿Qué checkea? |
|------|--------|---------------|
| 1 | **Barrio explícito** | Select desplegable con ~50 barrios porteños. Si el usuario selecciona uno conocido → acepta automático |
| 2 | **CPA (Código Postal Argentino)** | Extrae `C####` de la dirección. Rango C1000-C1999 = CABA. Si el CP es de otro rango → rechaza con mensaje claro |
| 3 | **Nominatim (OSM)** | Geocodifica vía OpenStreetMap. Solo acepta si `state` incluye "Ciudad Autónoma". Rechaza si es "Buenos Aires" (provincia) |
| ✋ | **Fallback** | Si nada funciona → rechaza y pide incluir el código postal |

**Keywords eliminadas:** `'buenos aires'` se sacó de TODAS las listas porque matchea tanto CABA como provincia de Buenos Aires (ej: "Biarritz, Buenos Aires" es provincia).

### Mercado Pago
- **Access Token:** `REDACTED`
- **Webhook Secret:** `REDACTED`
- `notification_url` apunta a `/api/mercadopago-webhook`
- Timeout de 8s con `AbortController` en todas las llamadas a APIs de MP
- `verify-payment.ts` es el endpoint principal de verificación (llamado desde index.astro post-redirect)
- El webhook existe con HMAC-SHA256 pero es secundario

### WhatsApp post-pago
- Después de pago confirmado + save en Sheets → muestra banner verde + **redirige automáticamente** a `wa.me/5491123861180` con resumen del pedido
- El usuario vuelve al sitio con "atrás" y ve el banner

### Google Sheets
- Librería: `google-spreadsheet` + `google-auth-library` (JWT con service account)
- Se necesita `GOOGLE_CREDENTIALS_BASE64` (JSON de service account en base64)
- `GOOGLE_SHEET_ID` = `1VY7TM-UGac0UiR-OY51xHXRQnEOs07Ewjql9j3eEreE`
- Columnas: Fecha, Preference ID, Estado, Nombre, Teléfono, Dirección, **Barrio**, Referencia, Productos, Total, Notas, Fecha de entrega, Horario

### Rate limiting
- `src/lib/rate-limit.ts`: in-memory, 20 req/min por IP
- Se aplica en: check-availability, create-preference, save-order, validate-address

---

## 📝 Changelog de cambios recientes

| Fecha | Commit | Cambio |
|-------|--------|--------|
| jun 10 | `d74bd5f` | feat: add explicit barrio field for CABA validation |
| jun 10 | `f603c40` | fix: remove 'buenos aires' keyword (matches both CABA and provincia) |
| jun 10 | `b4bc36c` | fix: strict CABA validation with zip code reject + Nominatim disambiguation |
| jun 10 | `f15fc0b` | fix: replace Georef with OSM Nominatim + expand CABA barrios |
| (prev) | — | Migrated from Vercel Functions (api/) to Astro API routes (src/pages/api/) |
| (prev) | — | Added MP webhook endpoint with HMAC verification |
| (prev) | — | Added verify-payment endpoint (server-side payment check) |
| (prev) | — | Phone validation 10-13 digits + date isNaN check |
| (prev) | — | Rate limiter (src/lib/rate-limit.ts) |

---

## 🐛 Edge cases identificados (pendientes, prioridad media)

1. **sessionStorage vacío post-pago** — si se pierde antes de `saveOrder`, el pedido nunca se guarda. Fix: guardar datos mínimos en URL params como fallback.
2. **save-order falla** — el error se loggea pero no hay reintento. Fix: agregar botón "Reintentar" en banner + mantener datos en sessionStorage.
3. **Duplicados por refresh** — si la página se recarga antes de `history.replaceState`, puede re-ejecutar `saveOrder`. Fix: idempotencia por preferenceId.
4. **Webhook duplicado** — MP envía múltiples notificaciones. Fix: trackear paymentId ya procesados.
5. **Teléfono internacional** — la validación 10-13 dígitos bloquea extranjeros. Revisar si es necesario.
6. **Validar Origin** — agregar check de header `Origin` contra `PUBLIC_SITE_URL` en endpoints POST sensibles.

---

## 🗺️ Próximos pasos

1. ✅ **~~Migrar a Astro API routes~~** — hecho
2. ✅ **~~Validación CABA robusta~~** — barrio + CPA + Nominatim
3. ❓ **WhatsApp auto-redirect post-pago** — pendiente de implementar redirect automático (manteniendo banner)
4. ❓ **Edge cases** — reintento save-order, datos URL fallback, validar Origin
5. ❓ **Google Sheets** — falta configurar `GOOGLE_CREDENTIALS_BASE64` (service account)

### Cómo configurar Google Sheets (pasos para el usuario)
1. Ir a https://console.cloud.google.com → proyecto existente o nuevo
2. Habilitar **Google Sheets API**
3. Crear credenciales → **Service Account** (NO OAuth)
4. Poner nombre ej: `guayafood` → Role: **Editor** → Done
5. Se descarga un JSON automáticamente
6. Codificarlo a base64:
   ```powershell
   [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("{JSON aquí}"))
   ```
7. Pegar en `.env`: `GOOGLE_CREDENTIALS_BASE64=<base64>`
8. Compartir la planilla con el `client_email` del JSON

---

## ⚠️ Problemas conocidos

- **Build local en Windows falla** — `@astrojs/vercel` da EPERM con symlinks de pnpm en Windows. No es problema en Vercel (Linux).
- **`.vercel/output/`** — contiene artifacts stale de builds anteriores. Puede causar confusión si se hace deploy manual.
- **MP_WEBHOOK_SECRET** — está en `.env` local pero debe configurarse manualmente en Vercel Dashboard (el `.env` está gitignored).
- **sessionStorage** — única fuente de datos post-redirect. Si el usuario abre el link en otro navegador/dispositivo, no hay datos.

---

## 📁 Archivos relevantes

| Archivo | Propósito |
|---------|-----------|
| `src/pages/index.astro` | Landing + handler post-pago (verify, save, banner, WA redirect) |
| `src/components/OrderModal.astro` | Modal de pedido con formulario completo + validación client-side |
| `src/pages/api/create-preference.ts` | Crea preferencia en MP con `notification_url` + valida CABA |
| `src/pages/api/mercadopago-webhook.ts` | Recibe IPN de MP con HMAC-SHA256 |
| `src/pages/api/verify-payment.ts` | Verificación server-side del pago (llamado desde index.astro) |
| `src/pages/api/save-order.ts` | Guarda orden en Google Sheets |
| `src/pages/api/validate-address.ts` | Validación CABA multicapa (barrio → CPA → Nominatim) |
| `src/pages/api/check-availability.ts` | Disponibilidad de slots horarios |
| `src/lib/rate-limit.ts` | Rate limiter in-memory (20 req/min por IP) |
| `src/lib/config.ts` | Config del sitio (URLs, WhatsApp, delivery) |
| `astro.config.mjs` | `output: 'static'`, `adapter: vercel()` |
| `.env` | Variables de entorno locales (gitignored) |
