export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';
import { sendFoundersExpoNotifications } from '../../../lib/foundersExpoMail.js';

export const POST: APIRoute = async ({ request }) => {
  const { registrationId, current } = await request.json();

  if (!registrationId) {
    return new Response(JSON.stringify({ error: 'Missing registrationId.' }), { status: 400 });
  }

  const { data: registration, error: lookupError } = await supabaseAdmin.from('registrations')
    .select('id, payment_verified, events (slug)').eq('id', registrationId).single();
  if (lookupError || !registration) {
    return new Response(JSON.stringify({ error: 'Registration not found.' }), { status: 404 });
  }
  const isFoundersExpo = (registration.events as any)?.slug === 'founders-expo-26';
  if (isFoundersExpo && registration.payment_verified) {
    return new Response(JSON.stringify({ error: 'This stall has already been approved.' }), { status: 409 });
  }
  const nextValue = current !== 'true';
  let update = supabaseAdmin
    .from('registrations')
    .update({ payment_verified: isFoundersExpo ? true : nextValue })
    .eq('id', registrationId);
  if (isFoundersExpo) update = update.eq('payment_verified', false);
  const { data: updated, error } = await update.select('id').maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!updated) return new Response(JSON.stringify({ error: 'This stall has already been approved.' }), { status: 409 });

  if (isFoundersExpo) {
    try {
      const delivery = await sendFoundersExpoNotifications(registrationId, 'approved', new URL(request.url).origin);
      return new Response(JSON.stringify({ success: true, delivery }), { status: 200 });
    } catch (mailError) {
      console.error('Approved stall email failed:', mailError);
      return new Response(JSON.stringify({ success: true, emailError: 'Stall approved, but email delivery failed. Use Retry email.' }), { status: 200 });
    }
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
