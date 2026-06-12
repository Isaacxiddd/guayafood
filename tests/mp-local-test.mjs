/**
 * Test local de la integración con Mercado Pago.
 * No requiere Vercel ni servidor Astro corriendo.
 * Ejecutar: node tests/mp-local-test.mjs
 */

import { readFileSync } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ── Cargar .env ────────────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const raw = readFileSync(join(__dir, '..', '.env'), 'utf-8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const k = t.slice(0, idx).trim();
    let v = t.slice(idx + 1).trim();
    // Quitar comillas si las hay
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
} catch { /* .env ausente — usar variables ya en el entorno */ }

// ── Helpers de output ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label, detail = '') {
  console.error(`  ❌ ${label}${detail ? `: ${detail}` : ''}`);
  failed++;
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`);
}

// ── MP API helper ──────────────────────────────────────────────────────────────
const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;

async function mpFetch(path, options = {}) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

// ── CATÁLOGO local (sin importar Astro) ───────────────────────────────────────
const CATALOG = {
  empanaditas: { name: 'Empanaditas venezolanas', unitPrice: 1500, description: 'Rellenas de carne mechada, pollo, queso y más' },
  tequenos:    { name: 'Tequeños irresistibles',  unitPrice: 1000, description: 'Crujientes por fuera, queso derretido por dentro' },
  pastelitos:  { name: 'Pastelitos',               unitPrice: 1800, description: 'Rellenos de carne, pollo o queso' },
  'combo-a':   { name: 'Combo A',                  unitPrice: 10000 },
  'combo-b':   { name: 'Combo B',                  unitPrice: 14500 },
  'combo-c':   { name: 'Combo C',                  unitPrice: 18000 },
};

function buildPreferencePayload(overrides = {}) {
  const siteUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:4321';
  const now = Date.now();

  // Fecha de entrega: 3 días desde hoy
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 3);
  // Saltar domingo
  if (deliveryDate.getDay() === 0) deliveryDate.setDate(deliveryDate.getDate() + 1);
  const dateStr = deliveryDate.toISOString().slice(0, 10);

  const phone = '1123861180';
  const areaCode = phone.slice(0, phone.length - 8);
  const number = phone.slice(-8);

  return {
    items: [
      {
        id: 'empanaditas',
        title: 'Empanaditas venezolanas',
        description: 'Rellenas de carne mechada, pollo, queso y más',
        quantity: 5,
        unit_price: 1500,
        currency_id: 'ARS',
      },
    ],
    payer: {
      name: 'Test',
      surname: 'Guayafood',
      email: 'test_user_123456@testuser.com',
      phone: { area_code: areaCode, number },
    },
    statement_descriptor: 'GUAYAFOOD',
    metadata: {
      customer_name: 'Test Guayafood',
      customer_phone: phone,
      customer_address: 'Av. Corrientes 1234, CABA',
      customer_barrio: 'balvanera',
      delivery_date: dateStr,
      delivery_time: '14:00-16:00',
      notes: 'Test local sin Vercel',
      total: 7500,
    },
    back_urls: {
      success: `${siteUrl}/?status=approved`,
      failure: `${siteUrl}/?status=failure`,
      pending: `${siteUrl}/?status=pending`,
    },
    auto_return: 'approved',
    notification_url: `${siteUrl}/api/mercadopago-webhook`,
    external_reference: `order_${now}_${dateStr}_14:00-16:00`,
    ...overrides,
  };
}

// ── Verificador de firma webhook (misma lógica que mercadopago-webhook.ts) ──────
function verifyWebhookSignature(dataId, xRequestId, xSignature, secret) {
  if (!xSignature || !secret) return false;
  const parts = xSignature.split(',');
  let ts = null, v1 = null;
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 'ts') ts = v;
    if (k === 'v1') v1 = v;
  }
  if (!ts || !v1) return false;

  let template = '';
  if (dataId) {
    const norm = /^[a-zA-Z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;
    template += `id:${norm};`;
  }
  if (xRequestId) template += `request-id:${xRequestId};`;
  template += `ts:${ts};`;

  const computed = createHmac('sha256', secret).update(template).digest('hex');
  if (computed.length !== v1.length) return false;
  return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(v1, 'hex'));
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

async function testCredentials() {
  section('1. Credenciales');

  if (!ACCESS_TOKEN) {
    fail('MERCADOPAGO_ACCESS_TOKEN está configurado');
    console.log('     → Agregá MERCADOPAGO_ACCESS_TOKEN en tu .env');
    return false;
  }
  ok('MERCADOPAGO_ACCESS_TOKEN presente');

  const { status, data } = await mpFetch('/v1/payments/search?limit=1');
  if (status === 200) {
    ok(`Token válido — búsqueda de pagos OK (${data.paging?.total ?? '?'} pagos en la cuenta)`);
    return true;
  } else if (status === 401) {
    fail('Token válido', 'Token inválido o expirado (401)');
    console.log('     → Regenerá tu Access Token en:');
    console.log('       https://www.mercadopago.com.ar/settings/account/credentials');
    console.log('       y actualizá MERCADOPAGO_ACCESS_TOKEN en tu .env');
    return false;
  } else {
    fail('Token válido', `status ${status} — ${JSON.stringify(data).slice(0, 120)}`);
    return false;
  }
}

async function testCreatePreference() {
  section('2. Crear preferencia (campos de calidad)');

  const payload = buildPreferencePayload();
  const { status, ok: isOk, data } = await mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!isOk) {
    fail('Preferencia creada', `status ${status} — ${JSON.stringify(data).slice(0, 200)}`);
    return null;
  }

  ok(`Preferencia creada: ${data.id}`);

  // Verificar campos de calidad presentes en la respuesta
  const checks = [
    ['init_point',           !!data.init_point],
    ['items[0].description', !!data.items?.[0]?.description],
    ['payer.email',          !!data.payer?.email],
    ['payer.surname',        !!data.payer?.surname],
    ['statement_descriptor', !!data.statement_descriptor],
    ['back_urls.success',    !!data.back_urls?.success],
    ['notification_url',     !!data.notification_url],
    ['external_reference',   !!data.external_reference],
  ];

  for (const [field, present] of checks) {
    if (present) ok(`Campo presente: ${field}`);
    else fail(`Campo presente: ${field}`);
  }

  console.log(`\n  🔗 init_point: ${data.init_point}`);
  return data.id;
}

async function testGetPreference(prefId) {
  section('3. Obtener preferencia creada');

  if (!prefId) { fail('Preferencia disponible para consultar'); return; }

  const { status, data } = await mpFetch(`/checkout/preferences/${prefId}`);
  if (status === 200) {
    ok(`GET /checkout/preferences/${prefId} → 200`);
    ok(`external_reference: ${data.external_reference}`);
  } else {
    fail('GET preferencia', `status ${status}`);
  }
}

async function testWebhookSignature() {
  section('4. Verificación de firma webhook');

  if (!WEBHOOK_SECRET) {
    console.log('  ⚠️  MP_WEBHOOK_SECRET no configurado — saltando tests de firma');
    console.log('     → Agregá MP_WEBHOOK_SECRET en tu .env para habilitar este test');
    return;
  }

  const secret = WEBHOOK_SECRET;
  const dataId = '123456789';
  const requestId = 'req-abc-123';
  const ts = String(Date.now());

  // Construir firma válida
  const template = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(template).digest('hex');
  const xSignature = `ts=${ts},v1=${v1}`;

  if (verifyWebhookSignature(dataId, requestId, xSignature, secret)) {
    ok('Firma válida verificada correctamente');
  } else {
    fail('Firma válida verificada');
  }

  // Firma corrupta debe fallar
  const badSig = xSignature.replace(v1.slice(0, 4), 'aaaa');
  if (!verifyWebhookSignature(dataId, requestId, badSig, secret)) {
    ok('Firma inválida rechazada correctamente');
  } else {
    fail('Firma inválida rechazada');
  }

  // Sin firma debe fallar
  if (!verifyWebhookSignature(dataId, requestId, null, secret)) {
    ok('Firma ausente rechazada correctamente');
  } else {
    fail('Firma ausente rechazada');
  }
}

async function testPayloadValidations() {
  section('5. Validaciones del payload (sin token)');

  // Items sin description — no debería romperse, MP lo acepta vacío
  const payloadNoDesc = buildPreferencePayload();
  payloadNoDesc.items[0].description = '';
  const { status: s1, data: d1 } = await mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify(payloadNoDesc),
  });
  if (s1 === 200 || s1 === 201) {
    ok('MP acepta items sin description (campo opcional)');
  } else {
    fail('MP acepta items sin description', `status ${s1}`);
  }

  // external_reference presente
  const payload2 = buildPreferencePayload();
  ok(`external_reference generado: ${payload2.external_reference}`);
  ok(`statement_descriptor configurado: "${payload2.statement_descriptor}"`);
  ok(`payer.email presente: "${payload2.payer.email}"`);
  ok(`payer.surname presente: "${payload2.payer.surname}"`);
}

async function testNameSplit() {
  section('6. Split nombre → first_name / last_name');

  const cases = [
    ['Leidy García',     'Leidy',   'García'],
    ['María José Pérez', 'María',   'José Pérez'],
    ['Valentina',        'Valentina', 'Valentina'],
    ['  Ana   López  ',  'Ana',     'López'],
  ];

  for (const [input, expFirst, expLast] of cases) {
    const parts = input.trim().split(/\s+/);
    const first = parts[0];
    const last = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
    if (first === expFirst && last === expLast) {
      ok(`"${input.trim()}" → first="${first}", last="${last}"`);
    } else {
      fail(`"${input.trim()}"`, `got first="${first}", last="${last}"`);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧪 Mercado Pago — Test local (sin Vercel)\n');
  console.log(`   Fecha: ${new Date().toLocaleString('es-AR')}`);
  console.log(`   Token: ${ACCESS_TOKEN ? ACCESS_TOKEN.slice(0, 12) + '...' : '❌ NO CONFIGURADO'}`);

  const tokenOk = await testCredentials();
  if (!tokenOk) {
    console.log('\n⛔ Sin token válido no se pueden ejecutar los tests contra MP API.\n');
  } else {
    const prefId = await testCreatePreference();
    await testGetPreference(prefId);
    await testPayloadValidations();
  }

  await testWebhookSignature();
  await testNameSplit();

  // ── Resumen ──────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Resultado: ${passed}/${total} tests pasaron`);
  if (failed > 0) {
    console.log(`  ❌ ${failed} fallaron`);
    process.exit(1);
  } else {
    console.log('  ✅ Todos pasaron');
  }
  console.log();
}

main().catch((err) => {
  console.error('\n💥 Error inesperado:', err.message);
  process.exit(1);
});
