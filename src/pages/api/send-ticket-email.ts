export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { generateTicketsPdfBytes } from '../../lib/ticketPdf.js';
import { verifyTicketAccessToken } from '../../lib/ticketAccess.js';
import { bytesToBase64 } from '../../lib/bytesToBase64.js';

const MAILEROO_ENDPOINT = 'https://smtp.maileroo.com/api/v2/emails';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function buildEmailHtml(registration: any) {
  const event = registration.events ?? {};
  const dateStr = event.date
    ? new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const whatsappLink = event.whatsapp_group_link;
  const eventMeta = [dateStr, event.time, event.venue].filter(Boolean).join(' - ');

  return `
    <div style="margin:0; padding:28px 12px; background:#080101; font-family:Arial, Helvetica, sans-serif; color:#fff;">
      <div style="max-width:560px; margin:0 auto; border:1px solid rgba(248,113,113,0.28); background:linear-gradient(145deg,#3b0806,#120202 58%,#050101); box-shadow:0 24px 70px rgba(0,0,0,0.35);">
        <div style="height:5px; background:linear-gradient(90deg,#fecaca,#ef4444,#f97316);"></div>
        <div style="padding:28px;">
          <p style="margin:0 0 12px; font-size:12px; letter-spacing:0.18em; text-transform:uppercase; color:#fca5a5; font-weight:700;">E-CELL VJIT PASS</p>
          <h1 style="margin:0 0 18px; font-size:30px; line-height:1.08; color:#ffffff;">You're registered, ${registration.name}.</h1>
          <div style="border:1px solid rgba(248,113,113,0.22); background:rgba(0,0,0,0.24); padding:18px; margin:0 0 16px;">
            <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:#fca5a5;">Event</p>
            <h2 style="margin:0 0 8px; font-size:20px; line-height:1.25; color:#ffffff;">${event.title ?? 'Event'}</h2>
            <p style="margin:0; font-size:14px; line-height:1.55; color:#fee2e2;">${eventMeta || 'Details will be shared soon.'}</p>
          </div>
          <div style="border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.045); padding:16px; margin:0 0 16px;">
            <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:#fca5a5;">Ticket</p>
            <p style="margin:0; font-size:14px; line-height:1.65; color:#f3f4f6;">Your ticket PDF is attached and includes your personal QR code. Bring the QR code to check in at the venue.</p>
          </div>
          ${registration.team_name ? `
            <div style="border:1px solid rgba(255,255,255,0.12); background:rgba(0,0,0,0.2); padding:14px; margin:0 0 16px;">
              <p style="margin:0 0 6px; font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:#fca5a5;">Team</p>
              <p style="margin:0; font-size:16px; color:#ffffff; font-weight:700;">${registration.team_name}</p>
            </div>
          ` : ''}
          ${whatsappLink ? `
            <div style="border:1px solid rgba(34,197,94,0.34); background:rgba(20,83,45,0.22); padding:16px; margin:0 0 18px;">
              <p style="margin:0 0 10px; font-size:14px; line-height:1.55; color:#dcfce7;">Join the &quot;${event.title ?? 'event'}&quot; WhatsApp group for event updates.</p>
              <a href="${whatsappLink}" style="display:inline-block; padding:11px 16px; color:#ffffff; background:#15803d; text-decoration:none; font-size:14px; font-weight:700;">Join WhatsApp group</a>
            </div>
          ` : ''}
          <p style="margin:22px 0 0; font-size:13px; line-height:1.6; color:#fecaca;">See you there,<br /><strong>E-Cell VJIT</strong></p>
        </div>
      </div>
    </div>
  `;
}

export const POST: APIRoute = async ({ request }) => {
  const maillerooApiKey = import.meta.env.MAILEROO_API_KEY;
  const fromAddress = import.meta.env.MAILEROO_FROM_ADDRESS;
  const fromName = import.meta.env.MAILEROO_FROM_NAME || 'E-Cell VJIT';

  if (!maillerooApiKey || !fromAddress) {
    return json({ error: 'Email sending is not configured.' }, 500);
  }

  let body: any;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 20 * 1024) {
      return json({ error: 'Email request is too large.' }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const ticketIds = verifyTicketAccessToken(body?.accessToken);
  if (!ticketIds) {
    return json({ error: 'Ticket access has expired or is invalid.' }, 401);
  }

  const { data: registrations, error } = await supabaseAdmin
    .from('registrations')
    .select('id, name, email, phone, ticket_id, team_name, email_sent, events (slug, title, date, time, venue, whatsapp_group_link)')
    .in('ticket_id', ticketIds);

  if (error || !registrations) {
    return json({ error: 'Could not load registrations.' }, 500);
  }
  if (registrations.some((registration) => (registration.events as any)?.slug === 'founders-expo-26')) {
    return json({ error: 'Founders Expo emails are sent after admin approval.' }, 403);
  }

  const baseUrl = new URL(request.url).origin;
  const results = { sent: [] as string[], skipped: [] as string[], failed: [] as string[] };

  for (const registration of registrations) {
    if (registration.email_sent) {
      results.skipped.push(registration.ticket_id);
      continue;
    }

    try {
      const pdfBytes = await generateTicketsPdfBytes([registration], { baseUrl });
      const pdfBase64 = bytesToBase64(pdfBytes);

      const emailResponse = await fetch(MAILEROO_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${maillerooApiKey}`,
        },
        body: JSON.stringify({
          from: { address: fromAddress, display_name: fromName },
          to: [{ address: registration.email, display_name: registration.name }],
          subject: `Your ticket for ${(registration.events as any)?.title ?? 'the event'}`,
          html: buildEmailHtml(registration),
          attachments: [
            {
              file_name: 'ticket.pdf',
              content_type: 'application/pdf',
              content: pdfBase64,
            },
          ],
        }),
      });

      const emailResult = await emailResponse.json();

      if (!emailResponse.ok || !emailResult.success) {
        results.failed.push(registration.ticket_id);
        continue;
      }

      await supabaseAdmin
        .from('registrations')
        .update({ email_sent: true, email_sent_at: new Date().toISOString() })
        .eq('id', registration.id);

      results.sent.push(registration.ticket_id);
    } catch {
      results.failed.push(registration.ticket_id);
    }
  }

  return json(results);
};
