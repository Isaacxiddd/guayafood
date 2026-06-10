import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { checkProcessed, markProcessed } from '../../lib/idempotency';

export const prerender = false;

function verifySignature(
  dataId: string | null,
  xRequestId: string | null,
  xSignature: string | null,
  secret: string,
): boolean {
  if (!xSignature || !secret) return false;

  const parts = xSignature.split(',');
  let ts: string | null = null;
  let v1: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }

  if (!ts || !v1) return false;

  let template = '';
  if (dataId) {
    const dataIdNormalized = /^[a-zA-Z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;
    template += `id:${dataIdNormalized};`;
  }
  if (xRequestId) {
    template += `request-id:${xRequestId};`;
  }
  template += `ts:${ts};`;

  const computed = crypto
    .createHmac('sha256', secret)
    .update(template)
    .digest('hex');

  if (computed.length !== v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(v1, 'hex'));
}

async function getPaymentDetails(paymentId: string): Promise<{ status: string; externalRef?: string; payerEmail?: string; payerName?: string; items?: { title: string; quantity: number; unitPrice: number }[]; transactionAmount?: number } | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      status: data.status,
      externalRef: data.external_reference,
      payerEmail: data.payer?.email,
      payerName: [data.payer?.first_name, data.payer?.last_name].filter(Boolean).join(' '),
      items: data.additional_info?.items?.map((i: any) => ({
        title: i.title,
        quantity: i.quantity,
        unitPrice: i.unit_price,
      })) || [],
      transactionAmount: data.transaction_amount,
    };
  } catch {
    return null;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MP_WEBHOOK_SECRET not configured');
    return new Response('OK', { status: 200 });
  }

  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  const url = new URL(request.url);
  const dataIdFromQuery = url.searchParams.get('data.id');

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('OK', { status: 200 });
  }

  const dataId = dataIdFromQuery || body?.data?.id || null;

  const isValid = verifySignature(dataId, xRequestId, xSignature, secret);

  if (!isValid) {
    console.error('Invalid webhook signature');
    return new Response('OK', { status: 200 });
  }

  const notificationType = body?.type || url.searchParams.get('type') || '';
  const notificationAction = body?.action || '';

  if (notificationType === 'payment' && dataId) {
    if (checkProcessed(dataId)) {
      return new Response('OK', { status: 200 });
    }
    const payment = await getPaymentDetails(dataId);
    if (payment && payment.status === 'approved') {
      markProcessed(dataId);
      console.log(`Payment approved: ${dataId}, external_ref: ${payment.externalRef}`);
    }
  }

  return new Response('OK', { status: 200 });
};
