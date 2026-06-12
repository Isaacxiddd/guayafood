import type { APIRoute } from 'astro';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { getClientIp, checkRateLimit, checkOrigin } from '../../lib/rate-limit';
import { checkProcessed, markProcessed } from '../../lib/idempotency';
import { PRODUCT_CATALOG } from '../../lib/config';

export const prerender = false;

function sanitizeSheetValue(value: unknown): string {
  const str = typeof value === 'string' ? value : String(value ?? '');
  // Strip null bytes and control characters (except normal whitespace)
  const clean = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Strip leading whitespace before checking for formula characters (\t \r \n)
  const trimmed = clean.trimStart();
  if (/^[=+\-@|`]/.test(trimmed)) return `'${clean}`;
  return clean;
}

function getAuth() {
  const base64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!base64) return null;
  try {
    const creds = JSON.parse(Buffer.from(base64, 'base64').toString());
    return new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } catch {
    return null;
  }
}

function getSheetId() {
  return process.env.GOOGLE_SHEET_ID || '';
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

  let body: {
    preferenceId: string;
    status: string;
    name: string;
    phone: string;
    address: string;
    barrio?: string;
    reference?: string;
    items: { title?: string; productId?: string; quantity: number }[];
    total: number;
    notes?: string;
    deliveryDate?: string;
    deliveryTime?: string;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.preferenceId || !body.name || !body.address) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (checkProcessed(body.preferenceId)) {
    return new Response(JSON.stringify({ ok: true, cached: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const auth = getAuth();
    const sheetId = getSheetId();

    if (auth && sheetId) {
      const doc = new GoogleSpreadsheet(sheetId, auth);
      await doc.loadInfo();

      let sheet = doc.sheetsByTitle['Pedidos'];
      if (!sheet) {
        sheet = await doc.addSheet({ title: 'Pedidos' });
      }

      if (!sheet.headerValues || sheet.headerValues.length === 0) {
        await sheet.setHeaderRow([
          'ID', 'Fecha pedido', 'Nombre cliente', 'WhatsApp', 'Producto',
          'Combo', 'Cantidad', 'Precio unit. ($)', 'Total ($)', 'Delivery ($)',
          'Seña ($)', 'Saldo ($)', 'Origen', 'Método pago', 'Fecha entrega',
          'Dirección', 'Zona/Barrio', 'Estado', 'Notas',
        ]);
      }

      const totalQty = body.items.reduce((sum, i) => sum + i.quantity, 0);

      const resolveItem = (i: { title?: string; productId?: string; quantity: number }): string => {
        const name = i.title || (i.productId ? PRODUCT_CATALOG.get(i.productId)?.name || i.productId : '?');
        return `${sanitizeSheetValue(name)} x${i.quantity}`;
      };

      await sheet.addRow({
        ID: body.preferenceId,
        'Fecha pedido': new Date().toISOString(),
        'Nombre cliente': sanitizeSheetValue(body.name),
        WhatsApp: sanitizeSheetValue(body.phone),
        Producto: body.items.map(resolveItem).join(', '),
        Combo: '',
        Cantidad: totalQty,
        'Precio unit. ($)': '',
        'Total ($)': `$${body.total.toLocaleString('es-AR')}`,
        'Delivery ($)': '',
        'Seña ($)': `$${body.total.toLocaleString('es-AR')}`,
        'Saldo ($)': '$0',
        Origen: 'Web',
        'Método pago': 'Mercado Pago',
        'Fecha entrega': body.deliveryDate || '',
        Dirección: sanitizeSheetValue(body.address),
        'Zona/Barrio': sanitizeSheetValue(body.barrio || ''),
        Estado: body.status,
        Notas: sanitizeSheetValue(body.notes || ''),
      });
      markProcessed(body.preferenceId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Save order error:', error);
    return new Response(JSON.stringify({ error: 'Error al guardar el pedido' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
