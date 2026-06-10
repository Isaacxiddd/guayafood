import type { APIRoute } from 'astro';
import { getClientIp, checkRateLimit } from '../../lib/rate-limit';

export const prerender = false;

function extractPostalCode(address: string): string | null {
  const match = address.match(/\bC\d{4}\b/);
  return match ? match[0] : null;
}

function keywordCheck(address: string): boolean {
  const lower = address.toLowerCase();
  const keywords = [
    'capital federal', 'caba', 'buenos aires',
    'ciudad autonoma de buenos aires',
  ];
  return keywords.some((kw) => lower.includes(kw));
}

function zipCodeCheck(address: string): boolean {
  const cp = extractPostalCode(address);
  if (!cp) return false;
  const num = parseInt(cp.slice(1), 10);
  return num >= 1000 && num <= 1999;
}

async function georefCheck(address: string): Promise<{ isCaba: boolean; confidence: string } | null> {
  try {
    const encoded = encodeURIComponent(address);
    const url = `https://apis.gob.ar/georef/api/direcciones?direccion=${encoded}&provincia=Ciudad Aut%C3%B3noma de Buenos Aires&max_resultados=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const cantResultados = data.cantidad || 0;
    if (cantResultados > 0) {
      return { isCaba: true, confidence: 'alta' };
    }
    return { isCaba: false, confidence: 'baja' };
  } catch {
    return null;
  }
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

  let body: { address?: string };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const address = (body.address || '').trim();
  if (!address) {
    return new Response(JSON.stringify({ error: 'Falta la dirección' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (keywordCheck(address)) {
    return new Response(JSON.stringify({ isCaba: true, method: 'keyword', confidence: 'alta' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (zipCodeCheck(address)) {
    return new Response(JSON.stringify({ isCaba: true, method: 'zipcode', confidence: 'alta' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const georefResult = await georefCheck(address);

  if (georefResult) {
    return new Response(JSON.stringify({
      isCaba: georefResult.isCaba,
      method: 'georef',
      confidence: georefResult.confidence,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    isCaba: true,
    method: 'fallback',
    confidence: 'baja',
    warning: 'No se pudo verificar automáticamente. Confirmá que sea CABA.',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
