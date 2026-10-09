export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';

export const POST: APIRoute = async ({ request }) => {
  const { ticketId } = await request.json();

  if (!ticketId || typeof ticketId !== 'string') {
    return new Response(JSON.stringify({ found: false, error: 'No ticket ID provided.' }), { status: 400 });
  }

  const { data: registration, error } = await supabaseAdmin
    .from('registrations')
    .select('id, name, email, team_name, is_team_leader, is_checked_in, checked_in_at, events (slug, title, date, time, venue)')
    .eq('ticket_id', ticketId)
    .single();

  if (error || !registration) {
    return new Response(JSON.stringify({ found: false }), { status: 200 });
  }

  if (registration.is_checked_in) {
    return new Response(JSON.stringify({ found: true, alreadyCheckedIn: true, registration }), { status: 200 });
  }

  const checkedInAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('registrations')
    .update({ is_checked_in: true, checked_in_at: checkedInAt })
    .eq('id', registration.id);

  if (updateError) {
    return new Response(JSON.stringify({ found: false, error: updateError.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      found: true,
      alreadyCheckedIn: false,
      registration: { ...registration, is_checked_in: true, checked_in_at: checkedInAt },
    }),
    { status: 200 }
  );
};
