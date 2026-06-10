import type { IncomingMessage, ServerResponse } from 'node:http';

const ADVANCE_HOURS = parseInt(process.env.PUBLIC_ADVANCE_HOURS || '24', 10);
const WORKING_DAYS = [1, 2, 3, 4, 5, 6];
const DEFAULT_EMAIL = 'cliente@guayafood.com';

function validateDeliveryDate(dateStr: string): string | null {
  if (!dateStr) return 'Falta la fecha de entrega.';
  const selected = new Date(dateStr + 'T12:00:00');
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

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing MERCADOPAGO_ACCESS_TOKEN' }));
    return;
  }

  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://guayafood.vercel.app';

  let body: {
    items: { title: string; quantity: number; unitPrice: number }[];
    customer: { name: string; phone: string; address: string };
    notes?: string;
    deliveryDate?: string;
    deliveryTime?: string;
    reference?: string;
  };

  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!body.items?.length || !body.customer?.name || !body.customer?.address) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Faltan campos obligatorios' }));
    return;
  }

  const addr = body.customer.address.toLowerCase();
  const isCaba = ['capital federal', 'caba', 'buenos aires', 'ciudad autonoma de buenos aires'].some((k) => addr.includes(k))
    || /\bc\d{4}\b/.test(addr);

  if (!isCaba) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Solo entregamos en Capital Federal. Ingresá una dirección en CABA.' }));
    return;
  }

  const dateError = validateDeliveryDate(body.deliveryDate || '');
  if (dateError) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: dateError }));
    return;
  }

  const timeError = validateDeliveryTime(body.deliveryTime || '');
  if (timeError) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: timeError }));
    return;
  }

  try {
    const totalAmount = body.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    const orderPayload = {
      type: 'online',
      processing_mode: 'automatic',
      total_amount: totalAmount,
      items: body.items.map((i) => ({
        title: `${i.title} x${i.quantity}`,
        unit_price: i.unitPrice * i.quantity,
        quantity: 1,
      })),
      payer: {
        email: DEFAULT_EMAIL,
        name: body.customer.name,
        phone: { number: body.customer.phone },
      },
      transactions: {
        payments: [
          {
            payment_methods: {
              excluded: [],
              installments: null,
              default_installments: null,
            },
          },
        ],
      },
      back_urls: {
        success: `${siteUrl}/?status=approved`,
        failure: `${siteUrl}/?status=failure`,
        pending: `${siteUrl}/?status=pending`,
      },
      external_reference: `order_${Date.now()}_${body.deliveryDate}_${body.deliveryTime}`,
    };

    const idempotencyKey = `guayafood_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const mpRes = await fetch('https://api.mercadopago.com/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(orderPayload),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error('MP Orders API error:', mpData);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error al crear la orden en Mercado Pago' }));
      return;
    }

    const orderId = mpData.id;
    const initPoint = mpData.init_point;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      order_id: orderId,
      init_point: initPoint,
    }));
  } catch (error) {
    console.error('create-order error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Error al procesar el pago' }));
  }
}
