import type { APIRoute } from 'astro';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { getClientIp, checkRateLimit } from '../../lib/rate-limit';

export const prerender = false;

const MAX_ORDERS_PER_SLOT = parseInt(process.env.PUBLIC_MAX_ORDERS_PER_SLOT || '3', 10);

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

  let body: { date?: string; time?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.date || !body.time) {
    return new Response(JSON.stringify({ error: 'Missing date or time' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const auth = getAuth();
  const sheetId = getSheetId();

  if (!auth || !sheetId) {
    return new Response(JSON.stringify({ available: true, currentCount: 0, maxSlots: MAX_ORDERS_PER_SLOT }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const doc = new GoogleSpreadsheet(sheetId, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle['Pedidos'];
    if (!sheet) {
      return new Response(JSON.stringify({ available: true, currentCount: 0, maxSlots: MAX_ORDERS_PER_SLOT }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rows = await sheet.getRows();
    const dateCol = 'Fecha de entrega';
    const timeCol = 'Horario';

    const hasDateCol = sheet.headerValues?.includes(dateCol);
    const hasTimeCol = sheet.headerValues?.includes(timeCol);

    if (!hasDateCol || !hasTimeCol) {
      return new Response(JSON.stringify({ available: true, currentCount: 0, maxSlots: MAX_ORDERS_PER_SLOT }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const count = rows.filter((r) => {
      const rowDate = r.get(dateCol);
      const rowTime = r.get(timeCol);
      return rowDate === body.date && rowTime === body.time;
    }).length;

    const available = count < MAX_ORDERS_PER_SLOT;

    return new Response(JSON.stringify({
      available,
      currentCount: count,
      maxSlots: MAX_ORDERS_PER_SLOT,
      message: available
        ? `Disponible (${count}/${MAX_ORDERS_PER_SLOT} reservas)`
        : `Este horario ya está completo (${count}/${MAX_ORDERS_PER_SLOT}). Elegí otro.`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Check availability error:', error);
    return new Response(JSON.stringify({ available: true, currentCount: 0, maxSlots: MAX_ORDERS_PER_SLOT }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
