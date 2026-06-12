import type { APIRoute } from 'astro';
import { getClientIp, checkRateLimit, checkOrigin } from '../../lib/rate-limit';
import { PRODUCT_CATALOG } from '../../lib/config';
import { validateCabaAddress } from '../../lib/address';

export const prerender = false;

const ADVANCE_HOURS = parseInt(process.env.PUBLIC_ADVANCE_HOURS || '24', 10);
const WORKING_DAYS = [1, 2, 3, 4, 5, 6];

function validateDeliveryDate(dateStr: string): string | null {
  if (!dateStr) return 'Falta la fecha de entrega.';
  const selected = new Date(dateStr + 'T12:00:00');
  if (isNaN(selected.getTime())) return 'Fecha inválida.';
  const day = selected.getDay();
  if (day === 0) return 'No entregamos los domingos.';
  const minDate = new Date();
  minDate.setHours(minDate.getHours() + ADVANCE_HOURS);
  if (selected < new Date(minDate.toISOString().slice(0, 10) + 'T00:00:00')) {
    return `La fecha debe ser al menos ${ADVANCE_HOURS} hs después del momento actual.`;
  }
  return null;
}

function validateDeliveryTime(timeStr: string): string | null {
  if (!timeStr) return 'Falta el horario de entrega.';
  const validSlots = ['10:00-12:00', '14:00-16:00', '17:00-19:00', '19:00-21:00'];
  if (!validSlots.includes(timeStr)) return 'Horario de entrega inválido.';
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkOrigin(request)) {
    return new Response(JSON.stringify({ error: 'Origen no permitido' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = getClientIp(request);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Intentalo de nuevo en unos segundos.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rate.resetIn / 1000)) },
    });
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Missing MERCADOPAGO_ACCESS_TOKEN' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://guayafood.vercel.app';

  let body: {
    items: { productId: string; quantity: number }[];
    customer: { name: string; phone: string; address: string; barrio?: string };
    notes?: string;
    deliveryDate?: string;
    deliveryTime?: string;
    reference?: string;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.items?.length || !body.customer?.name || !body.customer?.address) {
    return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  for (const item of body.items) {
    const product = PRODUCT_CATALOG.get(item.productId);
    if (!product) {
      return new Response(JSON.stringify({ error: `Producto no válido: ${item.productId}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const addr = body.customer.address;
  const barrio = body.customer.barrio || '';
  const addressValidation = await validateCabaAddress(addr, barrio);

  if (!addressValidation.isCaba) {
    return new Response(JSON.stringify({ error: addressValidation.error || 'La dirección no corresponde a CABA. Solo entregamos en Capital Federal.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const phoneDigits = (body.customer.phone || '').replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 13) {
    return new Response(JSON.stringify({ error: 'Teléfono inválido. Ingresá un número argentino válido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const dateError = validateDeliveryDate(body.deliveryDate || '');
  if (dateError) {
    return new Response(JSON.stringify({ error: dateError }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const timeError = validateDeliveryTime(body.deliveryTime || '');
  if (timeError) {
    return new Response(JSON.stringify({ error: timeError }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const resolvedItems = body.items.map((item) => {
      const product = PRODUCT_CATALOG.get(item.productId)!;
      return {
        title: product.name,
        quantity: item.quantity,
        unitPrice: product.unitPrice,
      };
    });
    const total = resolvedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    const phoneDigitsOnly = phoneDigits.slice(-8);
    const areaCode = phoneDigits.slice(0, phoneDigits.length - 8);

    const payload = {
      items: [
        ...resolvedItems.map((i, idx) => ({
          id: `item-${idx}`,
          title: i.title,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          currency_id: 'ARS',
        })),
      ],
      payer: {
        name: body.customer.name,
        phone: { area_code: areaCode, number: phoneDigitsOnly },
      },
      metadata: {
        customer_name: body.customer.name,
        customer_phone: body.customer.phone,
        customer_address: body.customer.address,
        customer_barrio: body.customer.barrio || '',
        customer_reference: body.reference || '',
        notes: body.notes || '',
        delivery_date: body.deliveryDate || '',
        delivery_time: body.deliveryTime || '',
        items: body.items.map((item) => `${item.productId}|${item.quantity}`).join(','),
        total,
      },
      back_urls: {
        success: `${siteUrl}/?status=approved`,
        failure: `${siteUrl}/?status=failure`,
        pending: `${siteUrl}/?status=pending`,
      },
      auto_return: 'approved',
      notification_url: `${siteUrl}/api/mercadopago-webhook`,
      external_reference: `order_${Date.now()}_${body.deliveryDate}_${body.deliveryTime}`,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      const mpError = JSON.stringify(data);
      console.error('MP API error:', mpError);
      return new Response(JSON.stringify({ error: 'Error al procesar el pago. Intentalo de nuevo.', detail: mpError }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      preference_id: data.id,
      init_point: data.init_point,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Mercado Pago error:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
