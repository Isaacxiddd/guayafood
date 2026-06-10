import type { APIRoute } from 'astro';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { getClientIp, checkRateLimit } from '../../lib/rate-limit';

export const prerender = false;

function sanitizeSheetValue(value: string): string {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@]/.test(value)) return `'${value}`;
  return value;
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
    reference?: string;
    items: { title: string; quantity: number }[];
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

      const headers = [
        'Fecha', 'Preference ID', 'Estado', 'Nombre', 'Teléfono',
        'Dirección', 'Referencia', 'Productos', 'Total', 'Notas',
        'Fecha de entrega', 'Horario',
      ];

      if (!sheet.headerValues || sheet.headerValues.length === 0) {
        await sheet.setHeaderRow(headers);
      }

      const existingHeaders = sheet.headerValues || [];
      const missingHeaders = headers.filter((h) => !existingHeaders.includes(h));
      if (missingHeaders.length > 0) {
        await sheet.setHeaderRow(headers);
      }

      await sheet.addRow({
        Fecha: new Date().toISOString(),
        'Preference ID': body.preferenceId,
        Estado: body.status,
        Nombre: sanitizeSheetValue(body.name),
        Teléfono: sanitizeSheetValue(body.phone),
        Dirección: sanitizeSheetValue(body.address),
        Referencia: sanitizeSheetValue(body.reference || ''),
        Productos: body.items.map((i) => `${sanitizeSheetValue(i.title)} x${i.quantity}`).join(', '),
        Total: `$${body.total.toLocaleString('es-AR')}`,
        Notas: sanitizeSheetValue(body.notes || ''),
        'Fecha de entrega': body.deliveryDate || '',
        Horario: body.deliveryTime || '',
      });
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
