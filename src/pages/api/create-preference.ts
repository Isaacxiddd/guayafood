import type { APIRoute } from 'astro';
import { getClientIp, checkRateLimit } from '../../lib/rate-limit';

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
    items: { title: string; quantity: number; unitPrice: number }[];
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

  const addr = body.customer.address.toLowerCase();
  const barrio = (body.customer.barrio || '').toLowerCase().trim();
  const cabaKeywords = [
    'capital federal', 'caba', 'ciudad autonoma de buenos aires',
    'agronomía', 'almagro', 'balvanera', 'barracas', 'belgrano', 'boedo',
    'caballito', 'chacarita', 'colegiales', 'constitución', 'flores', 'floresta',
    'la boca', 'la paternal', 'liniers', 'mataderos', 'monte castro', 'montserrat',
    'nueva pompeya', 'nuñez', 'palermo', 'parque avellaneda', 'parque chacabuco',
    'parque patricios', 'puerto madero', 'recoleta', 'retiro', 'saavedra',
    'san cristóbal', 'san nicolás', 'san telmo', 'versalles', 'villa crespo',
    'villa del parque', 'villa devoto', 'villa general mitre', 'villa lugano',
    'villa luro', 'villa ortúzar', 'villa pueyrredón', 'villa real',
    'villa riachuelo', 'villa santa rita', 'villa soldati', 'villa urquiza',
    'villa de mayo', 'coghlan', 'palermo viejo', 'palermo soho', 'palermo hollywood',
    'las cañitas', 'abasto', 'once', 'congreso', 'tribunales', 'microcentro',
    'barrio norte', 'barrio sur',
  ];

  let addressValid = false;

  if (barrio && barrio !== 'otro') {
    const known = [...cabaKeywords, 'constitucion'];
    if (known.includes(barrio)) addressValid = true;
  }

  if (!addressValid) {
    const cpMatch = addr.match(/\bc(\d{4})\b/);
    if (cpMatch) {
      const cpNum = parseInt(cpMatch[1], 10);
      if (cpNum >= 1000 && cpNum <= 1999) {
        addressValid = true;
      } else {
        return new Response(JSON.stringify({ error: 'El código postal no corresponde a CABA. Solo entregamos en Capital Federal.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (!cabaKeywords.some((k) => addr.includes(k))) {
      return new Response(JSON.stringify({ error: 'No pudimos verificar que la dirección sea de CABA. Incluí el código postal (ej: C1425).' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
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
    const payload = {
      items: [
        ...body.items.map((i) => ({
          id: 'MP-ITEM',
          title: i.title,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          currency_id: 'ARS',
        })),
      ],
      payer: {
        name: body.customer.name,
        phone: { number: body.customer.phone },
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
      console.error('MP API error:', JSON.stringify(data));
      return new Response(JSON.stringify({ error: 'Error al procesar el pago. Intentalo de nuevo.' }), {
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
