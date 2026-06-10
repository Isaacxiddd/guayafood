import { MercadoPagoConfig, Preference } from 'mercadopago';
import type { IncomingMessage, ServerResponse } from 'node:http';

const ADVANCE_HOURS = parseInt(process.env.PUBLIC_ADVANCE_HOURS || '24', 10);

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
    console.log('Creating MP preference with items:', JSON.stringify(body.items));
    console.log('Customer:', JSON.stringify(body.customer));

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: body.items.map((i) => ({
          id: 'MP-ITEM',
          title: i.title,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          currency_id: 'ARS',
        })),
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
        external_reference: `order_${Date.now()}_${body.deliveryDate || ''}_${body.deliveryTime || ''}`,
      },
    });

    console.log('MP preference created:', result.id, result.init_point);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      preference_id: result.id,
      init_point: result.init_point,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('create-order error:', message, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Error al procesar el pago: ${message}` }));
  }
}
