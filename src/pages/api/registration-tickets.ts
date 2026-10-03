export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { verifyTicketAccessToken } from '../../lib/ticketAccess.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 20 * 1024) {
      return json({ error: 'Ticket request is too large.' }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid ticket request.' }, 400);
  }

  const ticketIds = verifyTicketAccessToken(body?.accessToken);
  if (!ticketIds) return json({ error: 'Ticket access has expired or is invalid.' }, 401);

  const { data: registrations, error } = await supabaseAdmin
    .from('registrations')
    .select('name, email, phone, ticket_id, team_name, events (title, date, time, venue, whatsapp_group_link)')
    .in('ticket_id', ticketIds);

  if (error) {
    console.error('Ticket lookup failed:', error.code, error.message);
    return json({ error: 'Could not load your tickets.' }, 500);
  }
  if (!registrations || registrations.length !== ticketIds.length) {
    return json({ error: 'One or more tickets could not be found.' }, 404);
  }

  return json({ registrations });
};
